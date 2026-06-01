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
 * Buyer total for a seller list price: platform fee on top, then Paystack gross-up, always whole GHS.
 * Uses env `PLATFORM_COMMISSION_PERCENT` and Paystack checkout fee env vars.
 */
export function calculateBuyerTotal(
  vendorPrice: number,
  platformPercent: number = env.PLATFORM_COMMISSION_PERCENT,
  paystackPercent: number = env.PAYSTACK_CHECKOUT_FEE_PERCENT,
  paystackFixedGhs: number = env.PAYSTACK_CHECKOUT_FEE_FIXED_GHS
): number {
  const list = Math.max(0, Number(vendorPrice) || 0);
  const plat = Math.min(100, Math.max(0, Number(platformPercent) || 0)) / 100;
  const afterPlatform = list * (1 + plat);
  const p = Math.min(99.99, Math.max(0, Number(paystackPercent) || 0)) / 100;
  const k = Math.max(0, Number(paystackFixedGhs) || 0);
  const withPaystack = p <= 0 ? afterPlatform + k : (afterPlatform + k) / (1 - p);
  return Math.ceil(withPaystack);
}

/**
 * `merchantNetGhs` = seller subtotal + platform service fee (fees already added on top of list price).
 * Applies Paystack gross-up only — use after {@link serviceFeeOnVendorGross} is summed into the base.
 */
export function buyerTotalForMerchantNetGhs(
  merchantNetGhs: number,
  feePercent: number,
  feeFixedGhs: number
): number {
  const base = Math.max(0, Number(merchantNetGhs) || 0);
  const p = Math.min(99.99, Math.max(0, feePercent)) / 100;
  const k = Math.max(0, feeFixedGhs);
  const withPaystack = p <= 0 ? base + k : (base + k) / (1 - p);
  return Math.ceil(withPaystack);
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
