/**
 * Buyer checkout totals — fees on top of seller list price; whole GHS only (Math.ceil).
 * Percentages come from API / env via {@link normalizeCheckoutPricingOpts}, never hardcoded in UI.
 */

/** @param {number} vendorPrice Seller list subtotal (unit × qty or cart subtotal). */
export function calculateBuyerTotal(vendorPrice, platformPercent, paystackPercent, paystackFixedGhs = 0) {
  const list = Math.max(0, Number(vendorPrice) || 0);
  const plat = Math.min(100, Math.max(0, Number(platformPercent) || 0)) / 100;
  const afterPlatform = list * (1 + plat);
  const p = Math.min(99.99, Math.max(0, Number(paystackPercent) || 0)) / 100;
  const k = Math.max(0, Number(paystackFixedGhs) || 0);
  const withPaystack = p <= 0 ? afterPlatform + k : (afterPlatform + k) / (1 - p);
  return Math.ceil(withPaystack);
}

/**
 * @param {number} sellerSubtotal
 * @param {{ commissionPercent: number, paystackFeePercent: number, paystackFeeFixedGhs: number } | null | undefined} opts
 */
export function buyerTotalFromSellerSubtotal(sellerSubtotal, opts) {
  const sub = Number(sellerSubtotal);
  if (!opts || !(sub > 0)) return null;
  return calculateBuyerTotal(
    sub,
    opts.commissionPercent,
    opts.paystackFeePercent,
    opts.paystackFeeFixedGhs
  );
}

/**
 * Price label for product cards / cart lines (buyer-facing).
 * @param {number} listUnitPrice
 * @param {{ commissionPercent: number, paystackFeePercent: number, paystackFeeFixedGhs: number } | null | undefined} opts
 * @param {number} [qty]
 */
export function buyerDisplayPrice(listUnitPrice, opts, qty = 1) {
  const sub = (Number(listUnitPrice) || 0) * (Number(qty) || 1);
  if (!(sub > 0)) return 0;
  const total = opts ? buyerTotalFromSellerSubtotal(sub, opts) : null;
  return total != null ? total : Math.ceil(sub);
}

/**
 * Buyer-facing marginal cost between two seller list unit totals (e.g. with vs without an add-on).
 * @param {number} fromListUnit
 * @param {number} toListUnit
 * @param {{ commissionPercent: number, paystackFeePercent: number, paystackFeeFixedGhs: number } | null | undefined} opts
 */
export function buyerDisplayMarginalDelta(fromListUnit, toListUnit, opts) {
  const from = Math.max(0, Number(fromListUnit) || 0);
  const to = Math.max(0, Number(toListUnit) || 0);
  if (from === to) return 0;
  if (!opts) return Math.ceil(to - from);
  return buyerDisplayPrice(to, opts, 1) - buyerDisplayPrice(from, opts, 1);
}

/**
 * Cart / checkout breakdown (buyer sees `total` only in UI).
 */
export function computeCheckoutBreakdown(subtotal, commissionPercent, paystackFeePercent, paystackFeeFixedGhs) {
  const sub = Math.ceil(Number(subtotal) || 0);
  const r = Math.min(100, Math.max(0, Number(commissionPercent) || 0)) / 100;
  const serviceFee = Math.ceil(sub * r);
  const base = sub + serviceFee;
  const total = calculateBuyerTotal(sub, commissionPercent, paystackFeePercent, paystackFeeFixedGhs);
  const processingFee = Math.max(0, total - base);
  return { subtotal: sub, serviceFee, baseBeforeProcessing: base, processingFee, total };
}
