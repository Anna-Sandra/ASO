import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import { User } from "../modules/auth/user.model";
import { getOrCreateSettings } from "../modules/platform/platformSettings.service";
import { getVendorBillingSnapshot } from "../modules/vendorSubscription/vendorSubscription.service";

/**
 * Blocks seller write actions when the launch trial has ended and the seller has not paid
 * the platform subscription (unless exempt). Admins always pass.
 */
export async function requireVendorSubscription(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === "admin") return next();
  if (req.user?.role !== "seller") return next();

  const [user, settings] = await Promise.all([
    User.findById(req.user.id)
      .select("vendorSubscriptionStatus vendorSubscriptionExempt vendorSubscriptionExpiresAt role")
      .lean(),
    getOrCreateSettings()
  ]);
  if (!user) throw new HttpError(404, "Account not found");

  const billing = getVendorBillingSnapshot(user, settings);
  if (billing.canOperate) return next();

  const err = new HttpError(402, billing.message, "vendor_subscription_required");
  (err as HttpError & { billing?: typeof billing }).billing = billing;
  throw err;
}
