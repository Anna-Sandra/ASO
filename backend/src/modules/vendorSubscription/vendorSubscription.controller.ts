import type { Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";
import { paystackGet, paystackPost } from "../payments/paystackClient";
import {
  activateVendorSubscription,
  getVendorBillingSnapshot,
  sellerCanOperate
} from "./vendorSubscription.service";

type PaystackInitializeData = {
  authorization_url: string;
  reference: string;
  access_code: string;
};

type PaystackVerifyData = {
  status?: string;
  reference?: string;
  amount?: number;
  metadata?: { type?: string; userId?: string };
};

export const getVendorSubscriptionStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id)
    .select(
      "role vendorSubscriptionStatus vendorSubscriptionExempt vendorSubscriptionExpiresAt vendorSubscriptionPaidAt"
    )
    .lean();
  if (!user) throw new HttpError(404, "Account not found");
  const settings = await getOrCreateSettings();
  const billing = getVendorBillingSnapshot(user, settings);
  res.json({ billing });
});

export const initializeVendorSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!env.PAYSTACK_SECRET_KEY?.trim()) {
    throw new HttpError(503, "Online seller subscription payment is not configured yet. Contact support.");
  }

  const user = await User.findById(req.user!.id).select("email role vendorSubscriptionExempt");
  if (!user) throw new HttpError(404, "Account not found");
  if (user.role !== "seller") throw new HttpError(403, "Only approved sellers can subscribe.");

  const settings = await getOrCreateSettings();
  if (sellerCanOperate(user, settings)) {
    throw new HttpError(400, "Your seller subscription is already active.");
  }

  const email = String(user.email || "").trim();
  if (!email) throw new HttpError(400, "Add an email to your account before paying.");

  const priceGhs = Number(settings.vendorSubscriptionPriceGhs ?? env.VENDOR_SUBSCRIPTION_PRICE_GHS ?? 49);
  const amountSubunit = Math.round(priceGhs * 100);
  if (!Number.isFinite(amountSubunit) || amountSubunit < 100) {
    throw new HttpError(400, "Seller subscription price is not configured.");
  }

  const callback_url = `${env.APP_ORIGIN}/vendor/settings?subscription=success`;
  const data = await paystackPost<PaystackInitializeData>("/transaction/initialize", {
    email,
    amount: amountSubunit,
    currency: "GHS",
    callback_url,
    metadata: {
      type: "vendor_subscription",
      userId: user._id.toString()
    }
  });

  user.vendorSubscriptionPendingReference = data.reference;
  await user.save();

  res.json({
    authorizationUrl: data.authorization_url,
    reference: data.reference,
    amountGhs: priceGhs,
    periodMonths: Number(settings.vendorSubscriptionPeriodMonths ?? env.VENDOR_SUBSCRIPTION_PERIOD_MONTHS ?? 12)
  });
});

export const verifyVendorSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!env.PAYSTACK_SECRET_KEY?.trim()) throw new HttpError(503, "Paystack not configured");

  const ref = String(req.params.ref || "").trim();
  if (!ref) throw new HttpError(400, "Missing payment reference");

  const user = await User.findById(req.user!.id);
  if (!user) throw new HttpError(404, "Account not found");
  if (user.role !== "seller") throw new HttpError(403, "Forbidden");

  const pending = String(user.vendorSubscriptionPendingReference || "").trim();
  if (pending && pending !== ref) {
    throw new HttpError(400, "This reference does not match your pending subscription checkout.");
  }

  const remote = await paystackGet<PaystackVerifyData>(`/transaction/verify/${encodeURIComponent(ref)}`);
  if (String(remote?.status) !== "success") {
    return res.json({ ok: false, message: "Payment not completed yet." });
  }

  const metaUserId = String(remote.metadata?.userId || "").trim();
  if (metaUserId && metaUserId !== user._id.toString()) {
    throw new HttpError(403, "Payment does not belong to this account.");
  }

  const settings = await getOrCreateSettings();
  const expectedKobo = Math.round(Number(settings.vendorSubscriptionPriceGhs ?? env.VENDOR_SUBSCRIPTION_PRICE_GHS) * 100);
  const paidKobo = Number(remote.amount);
  if (Number.isFinite(expectedKobo) && Number.isFinite(paidKobo) && Math.abs(expectedKobo - paidKobo) > 1) {
    throw new HttpError(400, "Paid amount does not match the current seller subscription price.");
  }

  const periodMonths = Number(settings.vendorSubscriptionPeriodMonths ?? env.VENDOR_SUBSCRIPTION_PERIOD_MONTHS ?? 12);
  Object.assign(user, activateVendorSubscription(periodMonths));
  await user.save();

  const billing = getVendorBillingSnapshot(user, settings);
  res.json({ ok: true, billing });
});

/** Called from Paystack webhook when metadata.type is vendor_subscription. */
export async function finalizeVendorSubscriptionFromPaystack(
  reference: string,
  amountKobo: number,
  metaUserId?: string
): Promise<boolean> {
  const ref = String(reference || "").trim();
  if (!ref) return false;

  const user =
    (metaUserId && mongoose.isValidObjectId(metaUserId)
      ? await User.findById(metaUserId)
      : null) || (await User.findOne({ vendorSubscriptionPendingReference: ref }));

  if (!user || user.role !== "seller") return false;

  const settings = await getOrCreateSettings();
  const expectedKobo = Math.round(Number(settings.vendorSubscriptionPriceGhs ?? env.VENDOR_SUBSCRIPTION_PRICE_GHS) * 100);
  if (Number.isFinite(expectedKobo) && Number.isFinite(amountKobo) && Math.abs(expectedKobo - amountKobo) > 1) {
    return false;
  }

  const periodMonths = Number(settings.vendorSubscriptionPeriodMonths ?? env.VENDOR_SUBSCRIPTION_PERIOD_MONTHS ?? 12);
  Object.assign(user, activateVendorSubscription(periodMonths));
  await user.save();
  return true;
}
