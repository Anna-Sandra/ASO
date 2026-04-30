import { env } from "../config/env";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Platform service fee on the **vendor’s** line total (list price × qty). Added on top at checkout (buyer pays more;
 * seller still nets the full list amount per line).
 */
export function serviceFeeOnVendorGross(vendorGross: number, commissionPercent: number): number {
  const clamped = Math.min(100, Math.max(0, commissionPercent));
  const rate = clamped / 100;
  return roundMoney(vendorGross * rate);
}

/**
 * Linear Paystack fee on the buyer’s charge: `pct/100 * charge + fixedGhs` (approximation; adjust env to match your plan).
 */
export function paystackFeeOnChargeGhs(chargeGhs: number, feePercent: number, feeFixedGhs: number): number {
  const p = Math.min(100, Math.max(0, feePercent)) / 100;
  const k = Math.max(0, feeFixedGhs);
  return roundMoney(chargeGhs * p + k);
}

/**
 * Buyer pays `buyerTotal`; the PSP keeps roughly `fee(buyerTotal)`. Solve `buyerTotal` so the platform
 * nets `merchantNetGhs` after an **approximate** linear fee (percent + fixed) from env — tuned to your
 * stack, not read from Paystack’s “exact fee before pay” APIs.
 */
export function buyerTotalForMerchantNetGhs(
  merchantNetGhs: number,
  feePercent: number,
  feeFixedGhs: number
): number {
  const p = Math.min(99.99, Math.max(0, feePercent)) / 100;
  const k = Math.max(0, feeFixedGhs);
  const base = roundMoney(merchantNetGhs);
  if (p <= 0) return roundMoney(base + k);
  return roundMoney((base + k) / (1 - p));
}

/**
 * Legacy: split **buyer-paid gross** (old model) into platform fee and seller proceeds — commission was deducted from gross.
 * When `commissionPercent` is omitted, uses `env.PLATFORM_COMMISSION_PERCENT`.
 * Prefer {@link serviceFeeOnVendorGross} + {@link buyerTotalForMerchantNetGhs} for new orders (`pricingVersion` ≥ 2).
 */
export function splitLineGross(gross: number, commissionPercent?: number): { platformFee: number; sellerProceeds: number } {
  const pct = commissionPercent != null ? commissionPercent : env.PLATFORM_COMMISSION_PERCENT;
  const clamped = Math.min(100, Math.max(0, pct));
  const rate = clamped / 100;
  const platformFee = roundMoney(gross * rate);
  const sellerProceeds = roundMoney(gross - platformFee);
  return { platformFee, sellerProceeds };
}
