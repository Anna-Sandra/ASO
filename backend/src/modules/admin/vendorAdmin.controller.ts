import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { User, normalizeUserRole } from "../auth/user.model";
import { VendorApplication } from "../vendorApplications/vendorApplication.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";
import { initialVendorSubscriptionOnApproval } from "../vendorSubscription/vendorSubscription.service";
import { promoteBuyerToSellerFromVendorApplication } from "../../utils/promoteVendorFromApplication";
import { issueVendorActivationEmail, appOriginBase } from "../../utils/vendorApplicationActivation";
import { buildVendorApprovedExistingAccountEmailHtml } from "../../utils/vendorActivationEmail";
import { issuePasswordSetupEmail, randomTemporaryPassword } from "../../utils/passwordSetupEmail";
import { sendEmail } from "../../utils/mailer";
import { recordAdminAuditEvent } from "./adminAuditEvent.model";
import { adminCreateVendorSchema } from "./admin.schemas";

const SALT_ROUNDS = 12;
const ADMIN_VENDOR_NOTE = "Created by platform super admin";

type CreateVendorBody = ReturnType<typeof adminCreateVendorSchema.parse>;

function vendorApplicationPayload(body: CreateVendorBody, email: string, userId?: mongoose.Types.ObjectId) {
  return {
    userId: userId ?? null,
    fullName: body.fullName.trim(),
    email,
    shopName: body.shopName.trim(),
    category: body.category,
    phone: body.phone.trim(),
    altPhone: (body.altPhone || "").trim(),
    sellsDescription: (body.sellsDescription || "").trim() || "Added by platform admin",
    shopDescription: (body.shopDescription || "").trim() || "Added by platform admin",
    locationLat: 0,
    locationLng: 0,
    locationLabel: "",
    status: "approved" as const,
    adminNote: ADMIN_VENDOR_NOTE,
    reviewedAt: new Date()
  };
}

async function upsertApprovedVendorApplication(
  body: CreateVendorBody,
  email: string,
  userId?: mongoose.Types.ObjectId
) {
  const existing = await VendorApplication.findOne({
    email,
    status: { $in: ["pending", "approved"] }
  })
    .sort({ createdAt: -1 });
  const payload = vendorApplicationPayload(body, email, userId);
  if (existing) {
    Object.assign(existing, payload);
    if (userId) existing.userId = userId;
    await existing.save();
    return existing;
  }
  return VendorApplication.create(payload);
}

export const postAdminCreateVendor = asyncHandler(async (req: Request, res: Response) => {
  const body = adminCreateVendorSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const password = body.password || "";
  const existing = await User.findOne({ email });

  if (existing) {
    const role = normalizeUserRole(existing.role);
    if (role === "seller") {
      throw new HttpError(409, "This email is already a vendor account.");
    }
    if (role === "admin" || role === "rider") {
      throw new HttpError(400, `This email is tied to a ${role} account and cannot become a vendor.`);
    }

    const app = await upsertApprovedVendorApplication(body, email, existing._id);
    const promoteResult = await promoteBuyerToSellerFromVendorApplication(app, undefined);

    if (promoteResult.kind === "blocked") {
      throw new HttpError(400, "This account cannot become a vendor.");
    }
    if (promoteResult.kind === "needs_activation") {
      throw new HttpError(400, "Could not promote this shopper account to vendor.");
    }

    if (password) {
      const promotedUser = await User.findById(promoteResult.userId).select("+passwordHash");
      if (promotedUser) {
        promotedUser.passwordHash = await bcrypt.hash(randomTemporaryPassword(), SALT_ROUNDS);
        await promotedUser.save();
      }
      const userId = new mongoose.Types.ObjectId(promoteResult.userId);
      await issuePasswordSetupEmail({
        userId,
        email,
        displayName: body.fullName.trim(),
        accountLabel: "vendor"
      });
      await recordAdminAuditEvent({
        actorId: req.user?.id,
        action: "vendor.create",
        title: `Vendor added — ${body.shopName.trim().slice(0, 60)}`,
        detail: `${email} · existing shopper promoted · password setup email`
      });
      res.status(201).json({
        ok: true,
        mode: "existing_buyer",
        sellerReady: true,
        userId: promoteResult.userId,
        passwordSetupEmailSent: true,
        message:
          "Vendor access enabled. We emailed them a link to set their own password before signing in."
      });
      return;
    }

    const signInUrl = `${appOriginBase()}/login`;
    await sendEmail(
      email,
      "Your SHOPIQGH vendor account is ready",
      buildVendorApprovedExistingAccountEmailHtml({
        fullName: body.fullName.trim(),
        shopName: body.shopName.trim(),
        signInUrl
      }),
      { category: "vendor_approval" }
    );

    await recordAdminAuditEvent({
      actorId: req.user?.id,
      action: "vendor.create",
      title: `Vendor added — ${body.shopName.trim().slice(0, 60)}`,
      detail: `${email} · existing shopper promoted`
    });

    res.status(201).json({
      ok: true,
      mode: "existing_buyer",
      sellerReady: true,
      userId: promoteResult.userId,
      message: "Vendor access enabled. They can sign in with their existing shopper password."
    });
    return;
  }

  if (password) {
    const passwordHash = await bcrypt.hash(randomTemporaryPassword(), SALT_ROUNDS);
    const settings = await getOrCreateSettings();
    const subInit = initialVendorSubscriptionOnApproval(settings);
    const user = await User.create({
      email,
      passwordHash,
      displayName: body.fullName.trim(),
      phone: body.phone.trim(),
      role: "seller",
      sellerVerified: true,
      vendorStatus: "approved",
      businessName: body.shopName.trim(),
      emailVerifiedAt: env.AUTH_SKIP_EMAIL_VERIFICATION ? new Date() : new Date(),
      accountStatus: "active",
      sellerApprovedAt: subInit.sellerApprovedAt,
      vendorSubscriptionStatus: subInit.vendorSubscriptionStatus
    });
    await upsertApprovedVendorApplication(body, email, user._id);

    await issuePasswordSetupEmail({
      userId: user._id,
      email,
      displayName: body.fullName.trim(),
      accountLabel: "vendor"
    });

    await recordAdminAuditEvent({
      actorId: req.user?.id,
      action: "vendor.create",
      title: `Vendor added — ${body.shopName.trim().slice(0, 60)}`,
      detail: `${email} · new account · password setup email`
    });

    res.status(201).json({
      ok: true,
      mode: "account",
      sellerReady: true,
      userId: user._id.toString(),
      passwordSetupEmailSent: true,
      message:
        "Vendor account created. We emailed them a link to set their own password — do not share an admin-chosen password."
    });
    return;
  }

  const app = await VendorApplication.create(vendorApplicationPayload(body, email));
  await issueVendorActivationEmail(app);

  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "vendor.create",
    title: `Vendor added — ${body.shopName.trim().slice(0, 60)}`,
    detail: `${email} · activation email sent`
  });

  res.status(201).json({
    ok: true,
    mode: "activation_email",
    sellerReady: false,
    applicationId: app._id.toString(),
    message:
      "No account exists for this email yet. An activation link was sent so they can set a password and open their vendor dashboard."
  });
});
