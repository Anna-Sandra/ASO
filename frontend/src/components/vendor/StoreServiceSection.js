import React, { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { h } from "utils/h";
import { Button, Field, TextInput } from "components/ui";

/** Pickup / delivery options — edited on the storefront page (not in account settings). */
export function StoreServiceSection({ business, onSave, saving }) {
  const [pickup, setPickup] = useState(Boolean(business?.pickupAvailable));
  const [delivery, setDelivery] = useState(Boolean(business?.deliveryAvailable));
  const [fee, setFee] = useState(business?.deliveryFee != null ? String(business.deliveryFee) : "");
  const [eta, setEta] = useState(
    business?.estimatedDeliveryMins != null ? String(business.estimatedDeliveryMins) : ""
  );

  useEffect(() => {
    setPickup(Boolean(business?.pickupAvailable));
    setDelivery(Boolean(business?.deliveryAvailable));
    setFee(business?.deliveryFee != null ? String(business.deliveryFee) : "");
    setEta(business?.estimatedDeliveryMins != null ? String(business.estimatedDeliveryMins) : "");
  }, [
    business?.id,
    business?.pickupAvailable,
    business?.deliveryAvailable,
    business?.deliveryFee,
    business?.estimatedDeliveryMins
  ]);

  const save = async () => {
    const deliveryFee = fee.trim() === "" ? null : Number(fee);
    const estimatedDeliveryMins = eta.trim() === "" ? null : Number(eta);
    await onSave({
      pickupAvailable: pickup,
      deliveryAvailable: delivery,
      deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : null,
      estimatedDeliveryMins: Number.isFinite(estimatedDeliveryMins) ? estimatedDeliveryMins : null
    });
  };

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
          h("input", { type: "checkbox", checked: pickup, onChange: (e) => setPickup(e.target.checked) }),
          "Pickup available"
        ]),
        h("label", { className: "flex cursor-pointer items-center gap-2 text-sm font-medium" }, [
          h("input", { type: "checkbox", checked: delivery, onChange: (e) => setDelivery(e.target.checked) }),
          "Delivery available"
        ])
      ]),
      h("div", { className: "mt-4 grid gap-3 sm:grid-cols-2" }, [
        h(Field, { label: "Delivery fee (GHS)" }, [
          h(TextInput, { type: "number", min: 0, step: 0.5, value: fee, onChange: (e) => setFee(e.target.value) })
        ]),
        h(Field, { label: "Est. delivery (mins)" }, [
          h(TextInput, { type: "number", min: 1, value: eta, onChange: (e) => setEta(e.target.value) })
        ])
      ]),
      h("div", { className: "mt-4" }, [
        h(Button, { type: "button", disabled: saving, onClick: () => void save() }, "Save service options")
      ])
    ]
  );
}
