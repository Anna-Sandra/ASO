import mongoose from "mongoose";
import { User, normalizeUserRole } from "../modules/auth/user.model";
import { VendorApplication } from "../modules/vendorApplications/vendorApplication.model";
import { getOrCreateSettings } from "../modules/platform/platformSettings.service";
import { initialVendorSubscriptionOnApproval } from "../modules/vendorSubscription/vendorSubscription.service";
import { backfillSellerPhoneFromVendorApplication } from "./sellerContactPhone";

type VendorAppFields = {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId | null;
  email: string;
  fullName: string;
  shopName: string;
  phone: string;
  altPhone?: string;
};

export type PromoteVendorResult =
  | { kind: "promoted"; userId: string }
  | { kind: "already_seller"; userId: string }
  | { kind: "needs_activation" }
  | { kind: "blocked"; reason: string };

/**
 * Promotes an existing shopper account to seller from an approved vendor application.
 * Guest applicants (no account yet) return needs_activation — they use the email activation link.
 */
async function resolveUserForVendorApplication(app: VendorAppFields) {
  const appEmailNorm = (app.email || "").trim().toLowerCase();
  const byEmail = appEmailNorm ? await User.findOne({ email: appEmailNorm }) : null;
  if (!app.userId) return byEmail;

  const byId = await User.findById(app.userId);
  if (!byId) return byEmail;
  const linkedEmail = (byId.email || "").trim().toLowerCase();
  if (!appEmailNorm || !linkedEmail || linkedEmail === appEmailNorm) return byId;
  return byEmail;
}

export async function promoteBuyerToSellerFromVendorApplication(
  app: VendorAppFields,
  options?: { passwordHash?: string }
): Promise<PromoteVendorResult> {
  const appEmailNorm = (app.email || "").trim().toLowerCase();
  if (!appEmailNorm) return { kind: "needs_activation" };

  const user = await resolveUserForVendorApplication(app);

  if (!user) return { kind: "needs_activation" };

  const role = normalizeUserRole(user.role);
  if (role === "admin" || role === "rider") {
    return { kind: "blocked", reason: role };
  }
  if (role === "seller") {
    if (!app.userId) {
      await VendorApplication.updateOne({ _id: app._id }, { $set: { userId: user._id } });
    }
    const appPhone = [app.phone, app.altPhone].map((x) => (x || "").trim()).find(Boolean) || "";
    if (appPhone && !(user.phone || "").trim()) {
      await User.updateOne({ _id: user._id }, { $set: { phone: appPhone } });
    } else {
      await backfillSellerPhoneFromVendorApplication(user._id);
    }
    return { kind: "already_seller", userId: user._id.toString() };
  }
  if (role !== "buyer") return { kind: "needs_activation" };

  const settings = await getOrCreateSettings();
  const subInit = initialVendorSubscriptionOnApproval(settings);
  const displayName = (user.displayName || "").trim() || app.fullName.trim();

  const $set: Record<string, unknown> = {
    role: "seller",
    sellerVerified: true,
    vendorStatus: "approved",
    businessName: app.shopName.trim(),
    phone: app.phone.trim(),
    displayName,
    emailVerifiedAt: user.emailVerifiedAt || new Date(),
    accountStatus: "active",
    sellerApprovedAt: subInit.sellerApprovedAt,
    vendorSubscriptionStatus: subInit.vendorSubscriptionStatus
  };
  if (options?.passwordHash) {
    $set.passwordHash = options.passwordHash;
  }

  await User.updateOne({ _id: user._id }, { $set });
  await VendorApplication.updateOne(
    { _id: app._id },
    {
      $set: { userId: user._id },
      $unset: { activationTokenHash: "", activationExpiry: "" }
    }
  );

  return { kind: "promoted", userId: user._id.toString() };
}

/** Fixes approved applications whose linked shopper was never promoted (legacy flow). */
export async function reconcileApprovedVendorApplication(
  appId: mongoose.Types.ObjectId | string
): Promise<PromoteVendorResult | null> {
  const app = await VendorApplication.findOne({ _id: appId, status: "approved" }).lean();
  if (!app) return null;
  return promoteBuyerToSellerFromVendorApplication(app as VendorAppFields);
}
