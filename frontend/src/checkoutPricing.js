import { useEffect, useState } from "react";
import { apiFetch } from "./api";

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

export function useCheckoutPricingOptions() {
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/payments/checkout-options")
      .then((d) => {
        if (!cancelled) setOpts(d);
      })
      .catch(() => {
        if (!cancelled) setOpts(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return opts;
}
