import { env } from "../../config/env";
import type { PlatformSettingsDoc } from "../platform/platformSettings.model";
import { User, type UserDoc, type VendorSubscriptionStatus } from "../auth/user.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";

export type VendorBillingPhase = "free_forever" | "launch_trial" | "subscribed" | "payment_required";

export type VendorBillingSnapshot = {
  phase: VendorBillingPhase;
  billingEnabled: boolean;
  subscriptionRequired: boolean;
  canOperate: boolean;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
  daysLeftInTrial: number | null;
  priceGhs: number;
  periodMonths: number;
  status: VendorSubscriptionStatus;
  exempt: boolean;
  message: string;
};

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
}

function parseDeployedAt(raw: Date | null | undefined): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const fromEnv = (env.PLATFORM_DEPLOYED_AT || "").trim();
  if (fromEnv) {
    const d = new Date(fromEnv);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function getPlatformDeployedAt(settings: PlatformSettingsDoc): Date | null {
  return parseDeployedAt(settings.platformDeployedAt);
}

export function getPlatformTrialEndsAt(settings: PlatformSettingsDoc): Date | null {
  const deployed = getPlatformDeployedAt(settings);
  if (!deployed) return null;
  const months = Number(settings.vendorTrialMonths ?? env.VENDOR_TRIAL_MONTHS ?? 2);
  return addMonths(deployed, Math.max(0, months));
}

export function isPlatformLaunchTrialActive(settings: PlatformSettingsDoc, now = new Date()): boolean {
  if (settings.vendorSubscriptionBillingEnabled === false) return false;
  const ends = getPlatformTrialEndsAt(settings);
  if (!ends) return true;
  return now.getTime() < ends.getTime();
}

function normalizeSubStatus(raw: unknown): VendorSubscriptionStatus {
  if (raw === "trialing" || raw === "active" || raw === "past_due" || raw === "expired") return raw;
  return "none";
}

function hasActivePaidSubscription(user: Pick<UserDoc, "vendorSubscriptionStatus" | "vendorSubscriptionExpiresAt">, now = new Date()): boolean {
  const status = normalizeSubStatus(user.vendorSubscriptionStatus);
  if (status !== "active") return false;
  const exp = user.vendorSubscriptionExpiresAt;
  if (exp instanceof Date && !Number.isNaN(exp.getTime())) {
    return exp.getTime() > now.getTime();
  }
  return true;
}

export function getVendorBillingSnapshot(
  user: Pick<
    UserDoc,
    | "vendorSubscriptionStatus"
    | "vendorSubscriptionExempt"
    | "vendorSubscriptionExpiresAt"
    | "role"
  >,
  settings: PlatformSettingsDoc,
  now = new Date()
): VendorBillingSnapshot {
  const billingEnabled = settings.vendorSubscriptionBillingEnabled !== false;
  const priceGhs = Number(settings.vendorSubscriptionPriceGhs ?? env.VENDOR_SUBSCRIPTION_PRICE_GHS ?? 49);
  const periodMonths = Number(settings.vendorSubscriptionPeriodMonths ?? env.VENDOR_SUBSCRIPTION_PERIOD_MONTHS ?? 12);
  const exempt = Boolean(user.vendorSubscriptionExempt);
  const status = normalizeSubStatus(user.vendorSubscriptionStatus);
  const trialEnds = getPlatformTrialEndsAt(settings);
  const trialEndsAt = trialEnds ? trialEnds.toISOString() : null;
  const subExp =
    user.vendorSubscriptionExpiresAt instanceof Date && !Number.isNaN(user.vendorSubscriptionExpiresAt.getTime())
      ? user.vendorSubscriptionExpiresAt.toISOString()
      : null;

  if (!billingEnabled) {
    return {
      phase: "free_forever",
      billingEnabled: false,
      subscriptionRequired: false,
      canOperate: true,
      trialEndsAt,
      subscriptionExpiresAt: subExp,
      daysLeftInTrial: null,
      priceGhs,
      periodMonths,
      status,
      exempt,
      message: "Seller platform fees are not enabled on this environment."
    };
  }

  const launchTrial = isPlatformLaunchTrialActive(settings, now);
  const subscribed = hasActivePaidSubscription(user, now);

  if (exempt || subscribed) {
    return {
      phase: "subscribed",
      billingEnabled: true,
      subscriptionRequired: !launchTrial && !subscribed,
      canOperate: true,
      trialEndsAt,
      subscriptionExpiresAt: subExp,
      daysLeftInTrial: launchTrial && trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / 86400000)) : null,
      priceGhs,
      periodMonths,
      status: exempt ? "active" : status,
      exempt,
      message: exempt
        ? "Your seller account has a complimentary subscription."
        : subExp
          ? `Seller subscription active until ${new Date(subExp).toLocaleDateString()}.`
          : "Seller subscription active."
    };
  }

  if (launchTrial && trialEnds) {
    const daysLeft = Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / 86400000));
    return {
      phase: "launch_trial",
      billingEnabled: true,
      subscriptionRequired: false,
      canOperate: true,
      trialEndsAt,
      subscriptionExpiresAt: null,
      daysLeftInTrial: daysLeft,
      priceGhs,
      periodMonths,
      status: status === "none" ? "trialing" : status,
      exempt,
      message: `Free seller trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left until the platform seller fee applies.`
    };
  }

  return {
    phase: "payment_required",
    billingEnabled: true,
    subscriptionRequired: true,
    canOperate: false,
    trialEndsAt,
    subscriptionExpiresAt: subExp,
    daysLeftInTrial: 0,
    priceGhs,
    periodMonths,
    status: status === "trialing" ? "expired" : status === "none" ? "expired" : status,
    exempt,
    message: `Pay the seller platform fee (GHS ${priceGhs.toFixed(2)} / ${periodMonths} mo.) to add or edit listings and stores.`
  };
}

export function sellerCanOperate(
  user: Pick<UserDoc, "vendorSubscriptionStatus" | "vendorSubscriptionExempt" | "vendorSubscriptionExpiresAt" | "role">,
  settings: PlatformSettingsDoc,
  now = new Date()
): boolean {
  return getVendorBillingSnapshot(user, settings, now).canOperate;
}

export function initialVendorSubscriptionOnApproval(settings: PlatformSettingsDoc, now = new Date()): {
  sellerApprovedAt: Date;
  vendorSubscriptionStatus: VendorSubscriptionStatus;
} {
  const launchTrial = isPlatformLaunchTrialActive(settings, now);
  return {
    sellerApprovedAt: now,
    vendorSubscriptionStatus: launchTrial ? "trialing" : "expired"
  };
}

export async function vendorBillingForUserId(userId: string) {
  const user = await User.findById(userId)
    .select("role vendorSubscriptionStatus vendorSubscriptionExempt vendorSubscriptionExpiresAt")
    .lean();
  if (!user || user.role !== "seller") return null;
  const settings = await getOrCreateSettings();
  return getVendorBillingSnapshot(user, settings);
}

export function activateVendorSubscription(
  periodMonths: number,
  now = new Date()
): {
  vendorSubscriptionStatus: "active";
  vendorSubscriptionPaidAt: Date;
  vendorSubscriptionExpiresAt: Date;
  vendorSubscriptionPendingReference: "";
} {
  return {
    vendorSubscriptionStatus: "active",
    vendorSubscriptionPaidAt: now,
    vendorSubscriptionExpiresAt: addMonths(now, Math.max(1, periodMonths)),
    vendorSubscriptionPendingReference: ""
  };
}
