import { env } from "../config/env";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split line gross (buyer-paid) into platform fee and seller proceeds.
 * When `commissionPercent` is omitted, uses `env.PLATFORM_COMMISSION_PERCENT` (e.g. stored orders / legacy recompute).
 */
export function splitLineGross(gross: number, commissionPercent?: number): { platformFee: number; sellerProceeds: number } {
  const pct = commissionPercent != null ? commissionPercent : env.PLATFORM_COMMISSION_PERCENT;
  const clamped = Math.min(100, Math.max(0, pct));
  const rate = clamped / 100;
  const platformFee = roundMoney(gross * rate);
  const sellerProceeds = roundMoney(gross - platformFee);
  return { platformFee, sellerProceeds };
}
