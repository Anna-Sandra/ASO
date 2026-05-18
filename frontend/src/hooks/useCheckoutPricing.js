import { useEffect, useState } from "react";
import { apiFetch, fetchPublicPlatformConfig } from "services/api";

/** Align raw API payloads with fields used by {@link computeCheckoutBreakdown}. */
export function normalizeCheckoutPricingOpts(raw) {
  if (!raw || typeof raw !== "object") return null;
  const c = Number(raw.commissionPercent);
  if (!Number.isFinite(c)) return null;
  return {
    paystack: Boolean(raw.paystack),
    paystackOnly: Boolean(raw.paystackOnly),
    paystackCheckoutSplit: Boolean(raw.paystackCheckoutSplit),
    momoEnabled: Boolean(raw.momoEnabled),
    bankEnabled: Boolean(raw.bankEnabled),
    commissionPercent: c,
    paystackFeePercent: Number(raw.paystackFeePercent) || 0,
    paystackFeeFixedGhs: Number(raw.paystackFeeFixedGhs) || 0
  };
}

function pricingOptsFromPlatformConfig(cfg) {
  const p = cfg && typeof cfg === "object" ? cfg.payments : null;
  if (!p || typeof p !== "object") return null;
  return normalizeCheckoutPricingOpts({
    paystack: p.paystackEnabled,
    paystackOnly: p.paystackOnly,
    paystackCheckoutSplit: p.paystackCheckoutSplit,
    momoEnabled: p.momoEnabled,
    bankEnabled: p.bankEnabled,
    commissionPercent: p.commissionPercent,
    paystackFeePercent: p.paystackFeePercent,
    paystackFeeFixedGhs: p.paystackFeeFixedGhs
  });
}

/**
 * Buyer-facing checkout breakdown. Mirrors server order checkout + `buyerTotalForMerchantNetGhs`:
 * service fee on seller subtotal, then gross-up using **configured** % + fixed rates so the platform
 * still receives the intended net after payment-provider charges.
 *
 * Operational estimate for pricing parity — not Paystack’s exact pre-transaction fee API.
 * The UI does not show processing as its own line; total still includes that gross-up.
 */
export function computeCheckoutBreakdown(subtotal, commissionPercent, paystackFeePercent, paystackFeeFixedGhs) {
  const round2 = (n) => Math.round(Number(n) * 100) / 100;
  const sub = round2(subtotal);
  const r = Math.min(100, Math.max(0, Number(commissionPercent) || 0)) / 100;
  const serviceFee = round2(sub * r);
  const base = round2(sub + serviceFee);
  const p = Math.min(99.99, Math.max(0, Number(paystackFeePercent) || 0)) / 100;
  const k = Math.max(0, Number(paystackFeeFixedGhs) || 0);
  const total = p <= 0 ? round2(base + k) : round2((base + k) / (1 - p));
  const processingFee = round2(total - base);
  return { subtotal: sub, serviceFee, baseBeforeProcessing: base, processingFee, total };
}

/**
 * Total the buyer pays for a seller subtotal (list price × qty for an order or a single-item estimate).
 * Mirrors `/api/orders` checkout for pricingVersion 2. Returns null if `opts` is missing.
 */
export function buyerTotalFromSellerSubtotal(sellerSubtotal, opts) {
  const sub = Number(sellerSubtotal);
  if (!opts || !(sub > 0)) return null;
  return computeCheckoutBreakdown(
    sub,
    opts.commissionPercent,
    opts.paystackFeePercent,
    opts.paystackFeeFixedGhs
  ).total;
}

export function useCheckoutPricingOptions() {
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [co, cfg] = await Promise.allSettled([
        apiFetch("/api/payments/checkout-options"),
        fetchPublicPlatformConfig()
      ]);
      if (cancelled) return;
      if (co.status === "fulfilled") {
        const n = normalizeCheckoutPricingOpts(co.value);
        if (n) {
          setOpts(n);
          return;
        }
      }
      if (cfg.status === "fulfilled") {
        const n = pricingOptsFromPlatformConfig(cfg.value);
        if (n) {
          setOpts(n);
          return;
        }
      }
      setOpts(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return opts;
}
