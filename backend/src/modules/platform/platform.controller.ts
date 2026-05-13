import type { Request, Response } from "express";
import { env, isPaystackCheckoutSplitEnabled, isPaystackMoneyRailEnabled } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { getEffectiveCommissionPercent, getOrCreateSettings } from "./platformSettings.service";

export const getPublicPlatformConfig = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await getOrCreateSettings();
  const paystackRail = isPaystackMoneyRailEnabled();
  const commissionPercent = await getEffectiveCommissionPercent();
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.json({
    siteName: doc.siteName || "Campus Mart",
    siteDescription: doc.siteDescription || "",
    supportEmail: (doc.supportEmail || "").trim(),
    maintenanceMode: !!doc.maintenanceMode,
    maintenanceMessage: doc.maintenanceMessage || "",
    allowPublicRegistration: doc.allowPublicRegistration !== false,
    allowVendorApplications: doc.allowVendorApplications !== false,
    allowCourierApplications: doc.allowCourierApplications !== false,
    payments: {
      momoEnabled: paystackRail ? false : !!doc.momoEnabled,
      cardEnabled: !!doc.stripeEnabled,
      bankEnabled: paystackRail ? false : !!doc.bankEnabled,
      paystackEnabled: paystackRail,
      paystackOnly: paystackRail,
      paystackCheckoutSplit: isPaystackCheckoutSplitEnabled(),
      /** Same sources as GET /api/payments/checkout-options — for storefront all-in price display when that route is slow or blocked. */
      commissionPercent,
      paystackFeePercent: env.PAYSTACK_CHECKOUT_FEE_PERCENT,
      paystackFeeFixedGhs: env.PAYSTACK_CHECKOUT_FEE_FIXED_GHS
    }
  });
});
