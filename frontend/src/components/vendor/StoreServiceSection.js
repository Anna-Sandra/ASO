import React, { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { isServiceProviderStore } from "config/catalog";
import { h } from "utils/h";
import { Button, Field, TextInput } from "components/ui";
import { clearStorefrontDraftSection, readStorefrontDraft, writeStorefrontDraft } from "utils/vendorStorefrontDraft";

function serviceFromBusiness(business) {
  return {
    pickupAvailable: Boolean(business?.pickupAvailable),
    deliveryAvailable: Boolean(business?.deliveryAvailable),
    deliveryFee: business?.deliveryFee != null ? String(business.deliveryFee) : "",
    estimatedDeliveryMins:
      business?.estimatedDeliveryMins != null ? String(business.estimatedDeliveryMins) : ""
  };
}

/** Pickup / delivery options — edited on the storefront page (not in account settings). */
export function StoreServiceSection({ business, storeSlug, onSave, saving }) {
  const isService = isServiceProviderStore(business);
  const [pickup, setPickup] = useState(Boolean(business?.pickupAvailable));
  const [delivery, setDelivery] = useState(Boolean(business?.deliveryAvailable));
  const [fee, setFee] = useState(business?.deliveryFee != null ? String(business.deliveryFee) : "");
  const [eta, setEta] = useState(
    business?.estimatedDeliveryMins != null ? String(business.estimatedDeliveryMins) : ""
  );

  useEffect(() => {
    if (!business?.id) return;
    const draftSvc = readStorefrontDraft(storeSlug)?.service;
    const base = serviceFromBusiness(business);
    const merged = draftSvc && typeof draftSvc === "object" ? { ...base, ...draftSvc } : base;
    setPickup(Boolean(merged.pickupAvailable));
    setDelivery(Boolean(merged.deliveryAvailable));
    setFee(merged.deliveryFee != null ? String(merged.deliveryFee) : "");
    setEta(merged.estimatedDeliveryMins != null ? String(merged.estimatedDeliveryMins) : "");
  }, [business?.id, business?.updatedAt, storeSlug]);

  const persistDraft = (next) => {
    if (!storeSlug) return;
    writeStorefrontDraft(storeSlug, {
      service: {
        pickupAvailable: next.pickup,
        deliveryAvailable: next.delivery,
        deliveryFee: next.fee,
        estimatedDeliveryMins: next.eta
      }
    });
  };

  const save = async () => {
    const deliveryFee = fee.trim() === "" ? null : Number(fee);
    const estimatedDeliveryMins = eta.trim() === "" ? null : Number(eta);
    const ok = await onSave({
      pickupAvailable: pickup,
      deliveryAvailable: delivery,
      deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : null,
      estimatedDeliveryMins: Number.isFinite(estimatedDeliveryMins) ? estimatedDeliveryMins : null
    });
    if (ok !== false) clearStorefrontDraftSection(storeSlug, "service");
  };

  if (isService) return null;

  return h(
    "section",
    {
      id: "store-service",
      className:
        "scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-900/90"
    },
    [
      h("div", { className: "flex items-center gap-2 text-sky-600 dark:text-sky-300" }, [
        h(Truck, { className: "h-5 w-5" }),
        h("h2", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Pickup & delivery")
      ]),
      h(
        "p",
        { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" },
        "Configure how buyers can get orders from this store."
      ),
      h("div", { className: "mt-4 flex flex-wrap gap-4" }, [
        h("label", { className: "flex cursor-pointer items-center gap-2 text-sm font-medium" }, [
          h("input", {
            type: "checkbox",
            checked: pickup,
            onChange: (e) => {
              const next = e.target.checked;
              setPickup(next);
              persistDraft({ pickup: next, delivery, fee, eta });
            }
          }),
          "Pickup available"
        ]),
        h("label", { className: "flex cursor-pointer items-center gap-2 text-sm font-medium" }, [
          h("input", {
            type: "checkbox",
            checked: delivery,
            onChange: (e) => {
              const next = e.target.checked;
              setDelivery(next);
              persistDraft({ pickup, delivery: next, fee, eta });
            }
          }),
          "Delivery available"
        ])
      ]),
      h("div", { className: "mt-4 grid gap-3 sm:grid-cols-2" }, [
        h(Field, { label: "Delivery fee (GHS)" }, [
          h(TextInput, {
            type: "number",
            min: 0,
            step: 0.5,
            value: fee,
            onChange: (e) => {
              const next = e.target.value;
              setFee(next);
              persistDraft({ pickup, delivery, fee: next, eta });
            }
          })
        ]),
        h(Field, { label: "Est. delivery (mins)" }, [
          h(TextInput, {
            type: "number",
            min: 1,
            value: eta,
            onChange: (e) => {
              const next = e.target.value;
              setEta(next);
              persistDraft({ pickup, delivery, fee, eta: next });
            }
          })
        ])
      ]),
      h("div", { className: "mt-4" }, [
        h(Button, { type: "button", disabled: saving, onClick: () => void save() }, "Save service options")
      ])
    ]
  );
}
