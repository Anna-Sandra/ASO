import { useEffect, useState } from "react";
import { apiFetch, fetchPublicPlatformConfig } from "services/api";
import {
  buyerTotalFromSellerSubtotal,
  calculateBuyerTotal,
  computeCheckoutBreakdown
} from "utils/checkoutPricing";

export { buyerTotalFromSellerSubtotal, calculateBuyerTotal, computeCheckoutBreakdown };

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
