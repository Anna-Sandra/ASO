import { env } from "../../config/env";
import { PlatformSettings } from "./platformSettings.model";

let cache: { pct: number; at: number } | null = null;
const CACHE_MS = 30_000;

function defaultPlatformDeployedAt(): Date {
  const fromEnv = (env.PLATFORM_DEPLOYED_AT || "").trim();
  if (fromEnv) {
    const d = new Date(fromEnv);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function getOrCreateSettings() {
  let doc = await PlatformSettings.findOne().sort({ createdAt: 1 });
  if (!doc) {
    doc = await PlatformSettings.create({
      commissionPercent: env.PLATFORM_COMMISSION_PERCENT,
      platformDeployedAt: defaultPlatformDeployedAt(),
      vendorTrialMonths: env.VENDOR_TRIAL_MONTHS,
      vendorSubscriptionBillingEnabled: true,
      vendorSubscriptionPriceGhs: env.VENDOR_SUBSCRIPTION_PRICE_GHS,
      vendorSubscriptionPeriodMonths: env.VENDOR_SUBSCRIPTION_PERIOD_MONTHS
    });
  } else if (!doc.platformDeployedAt) {
    doc.platformDeployedAt = defaultPlatformDeployedAt();
    await doc.save();
  }
  return doc;
}

export async function getEffectiveCommissionPercent(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.pct;
  const doc = await getOrCreateSettings();
  const pct = doc.commissionPercent;
  cache = { pct, at: now };
  return pct;
}

export function clearCommissionCache() {
  cache = null;
}
