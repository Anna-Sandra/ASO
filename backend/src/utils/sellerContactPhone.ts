import mongoose from "mongoose";
import { User, publicPhoneForPaymentRole } from "../modules/auth/user.model";
import { Business } from "../modules/businesses/business.model";
import { VendorApplication } from "../modules/vendorApplications/vendorApplication.model";

function trimPhone(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const t = trimPhone(v);
    if (t) return t;
  }
  return "";
}

/** Phone shoppers may call — not bank/payout fields. */
export function sellerPublicContactPhone(userPhone?: string | null): string {
  return publicPhoneForPaymentRole("seller", userPhone);
}

/**
 * Batch-resolve public seller phones: account → approved vendor application → storefront contact.
 */
export async function buildSellerPublicPhoneMap(
  sellerIds: string[],
  usersById: Map<string, { phone?: string; email?: string }>,
  businessIdsBySeller: Map<string, string>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const needFallback: string[] = [];

  for (const sid of sellerIds) {
    const u = usersById.get(sid);
    const fromUser = sellerPublicContactPhone(u?.phone);
    if (fromUser) out.set(sid, fromUser);
    else needFallback.push(sid);
  }

  if (needFallback.length) {
    const oids = needFallback.map((id) => new mongoose.Types.ObjectId(id));
    const apps = await VendorApplication.find({ userId: { $in: oids } })
      .select("userId email phone altPhone updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    for (const app of apps) {
      const uid = app.userId ? app.userId.toString() : "";
      if (!uid || out.has(uid)) continue;
      const ph = firstNonEmpty(app.phone, app.altPhone);
      if (ph) out.set(uid, ph);
    }

    const stillMissing = needFallback.filter((sid) => !out.has(sid));
    const emails = [
      ...new Set(
        stillMissing
          .map((sid) => (usersById.get(sid)?.email || "").trim().toLowerCase())
          .filter(Boolean)
      )
    ];
    if (emails.length) {
      const appsByEmail = await VendorApplication.find({ email: { $in: emails } })
        .select("email phone altPhone updatedAt")
        .sort({ updatedAt: -1 })
        .lean();
      const emailToSeller = new Map(
        stillMissing.map((sid) => [(usersById.get(sid)?.email || "").trim().toLowerCase(), sid] as const)
      );
      for (const app of appsByEmail) {
        const em = (app.email || "").trim().toLowerCase();
        const sid = emailToSeller.get(em);
        if (!sid || out.has(sid)) continue;
        const ph = firstNonEmpty(app.phone, app.altPhone);
        if (ph) out.set(sid, ph);
      }
    }
  }

  const bizIds = [
    ...new Set(
      [...businessIdsBySeller.values()].filter((id) => mongoose.isValidObjectId(id))
    )
  ];
  if (bizIds.length) {
    const businesses = await Business.find({
      _id: { $in: bizIds.map((id) => new mongoose.Types.ObjectId(id)) }
    })
      .select("ownerId contactPhone")
      .lean();
    for (const b of businesses) {
      const owner = b.ownerId.toString();
      if (out.has(owner)) continue;
      const ph = trimPhone(b.contactPhone);
      if (ph) out.set(owner, ph);
    }
  }

  return out;
}

/** Copy vendor-application phone onto seller account when missing (legacy approvals). */
export async function backfillSellerPhoneFromVendorApplication(userId: mongoose.Types.ObjectId | string): Promise<boolean> {
  const uid = typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;
  const user = await User.findById(uid).select("phone email role").lean();
  if (!user || sellerPublicContactPhone(user.phone)) return false;

  const emailNorm = (user.email || "").trim().toLowerCase();
  const app = await VendorApplication.findOne({
    $or: [{ userId: uid }, ...(emailNorm ? [{ email: emailNorm }] : [])],
    status: "approved"
  })
    .sort({ updatedAt: -1 })
    .select("phone altPhone")
    .lean();

  const ph = firstNonEmpty(app?.phone, app?.altPhone);
  if (!ph) return false;

  await User.updateOne({ _id: uid }, { $set: { phone: ph } });
  return true;
}
