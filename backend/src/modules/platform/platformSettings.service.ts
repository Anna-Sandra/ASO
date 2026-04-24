import { env } from "../../config/env";
import { PlatformSettings } from "./platformSettings.model";

let cache: { pct: number; at: number } | null = null;
const CACHE_MS = 30_000;

export async function getOrCreateSettings() {
  let doc = await PlatformSettings.findOne().sort({ createdAt: 1 });
  if (!doc) {
    doc = await PlatformSettings.create({ commissionPercent: env.PLATFORM_COMMISSION_PERCENT });
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
