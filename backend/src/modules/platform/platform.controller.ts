import type { Request, Response } from "express";
import { DEFAULT_SITE_NAME } from "../../config/brand";
import {
  env,
  getEmailTransportMode,
  isEmailTransportConfigured,
  isPaystackCheckoutSplitEnabled,
  isPaystackMoneyRailEnabled
} from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { getUploadStorageDiagnostics } from "../../utils/uploadStorage";
import { getEffectiveCommissionPercent, getOrCreateSettings } from "./platformSettings.service";
import { getPlatformTrialEndsAt, isPlatformLaunchTrialActive } from "../vendorSubscription/vendorSubscription.service";
import {
  clientIpFromRequest,
  countryCodeFromHeaders,
  isRequestFromGhana,
  resolveCountryCodeForIp,
  reverseGeocodeLatLng
} from "../../utils/ghanaGeo";
import { HttpError } from "../../utils/httpError";

export const getPlatformAccessCheck = asyncHandler(async (req: Request, res: Response) => {
  const ghanaOnly = env.GHANA_ONLY_ENABLED;
  if (!ghanaOnly) {
    res.json({ allowed: true, ghanaOnly: false, country: null });
    return;
  }
  const allowed = await isRequestFromGhana(req);
  const ip = clientIpFromRequest(req);
  const country = countryCodeFromHeaders(req) || (await resolveCountryCodeForIp(ip));
  if (!allowed) {
    res.status(403).json({
      allowed: false,
      ghanaOnly: true,
      country: country || "unknown",
      message: "SHOPIQGH is only available in Ghana. If you are in Ghana, disable VPN and refresh."
    });
    return;
  }
  res.json({ allowed: true, ghanaOnly: true, country: country || "GH" });
});

export const getPublicPlatformConfig = asyncHandler(async (req: Request, res: Response) => {
  const doc = await getOrCreateSettings();
  const paystackRail = isPaystackMoneyRailEnabled();
  const commissionPercent = await getEffectiveCommissionPercent();
  const ghanaOnly = env.GHANA_ONLY_ENABLED;
  const regionAllowed = !ghanaOnly || (await isRequestFromGhana(req));
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.json({
    siteName: doc.siteName || DEFAULT_SITE_NAME,
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
    },
    vendorBilling: {
      billingEnabled: doc.vendorSubscriptionBillingEnabled !== false,
      launchTrialActive: isPlatformLaunchTrialActive(doc),
      trialEndsAt: (() => {
        const ends = getPlatformTrialEndsAt(doc);
        return ends ? ends.toISOString() : null;
      })(),
      trialMonths: doc.vendorTrialMonths ?? env.VENDOR_TRIAL_MONTHS,
      subscriptionPriceGhs: doc.vendorSubscriptionPriceGhs ?? env.VENDOR_SUBSCRIPTION_PRICE_GHS,
      subscriptionPeriodMonths: doc.vendorSubscriptionPeriodMonths ?? env.VENDOR_SUBSCRIPTION_PERIOD_MONTHS
    },
    /** Helps debug OTP mail on Render (no secrets exposed). */
    email: {
      configured: isEmailTransportConfigured(),
      transport: getEmailTransportMode()
    },
    uploads: getUploadStorageDiagnostics(),
    region: {
      ghanaOnly,
      allowed: regionAllowed,
      message: regionAllowed
        ? ""
        : "SHOPIQGH is only available in Ghana. If you are in Ghana, disable VPN and refresh."
    }
  });
});

/** Public: turn GPS into a readable place name for checkout / store pin UIs. */
export const reverseGeocodePublic = asyncHandler(async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpError(400, "lat and lng are required");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HttpError(400, "Coordinates out of range");
  }
  const label = await reverseGeocodeLatLng(lat, lng);
  res.set("Cache-Control", "public, max-age=300");
  res.json({
    label: label || "",
    lat,
    lng
  });
});
