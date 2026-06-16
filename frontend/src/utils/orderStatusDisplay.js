/**
 * Order fulfillment labels + badge styling when refunds affect what we show users.
 * "Delivered · Refunded" only when the refund completed after the order was already marked delivered.
 */

function humanizeRawOrderStatus(s, o) {
  if (isOnsiteOrder(o)) {
    if (s === "delivered") return "Completed";
    if (s === "sent_for_delivery") return "In progress";
    if (s === "processing") return "In progress";
  }
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function refundWasPostDelivery(o) {
  const flag = o.refundFulfillmentWasDelivered;
  if (flag === true) return true;
  if (flag === false) return false;
  return String(o.status || "") === "delivered";
}

/** Service-only orders — no courier / live map tracking. */
export function isOnsiteOrder(o) {
  return o?.fulfillmentMode === "onsite";
}

/** Primary label: order status, or refund-aware text when fully refunded. */
export function formatOrderFulfillmentLabel(o) {
  const rs = o.refundStatus || "none";
  if (rs !== "refunded") return humanizeRawOrderStatus(o.status, o);
  if (isOnsiteOrder(o) && refundWasPostDelivery(o)) return "Completed · Refunded";
  return refundWasPostDelivery(o) ? "Delivered · Refunded" : "Refunded";
}

/** Inline pill (buyer “My orders”) — neutral slate styling when money was returned without a completed delivery step. */
export function buyerOrderFulfillmentPillClass(o) {
  if ((o.refundStatus || "") === "refunded") {
    const post = refundWasPostDelivery(o);
    return post
      ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
      : "bg-sky-500/15 text-sky-800 dark:text-sky-200";
  }
  const status = o.status;
  if (status === "delivered") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "sent_for_delivery") return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (status === "processing") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (status === "paid") return "bg-teal-500/15 text-teal-700 dark:text-teal-300";
  if (status === "awaiting_vendor_payment") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (status === "pending_payment") return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
}

/** Admin `Badge` tone prop — aligns with order state and refund story. */
export function adminOrderFulfillmentBadgeTone(o) {
  if ((o.refundStatus || "") === "refunded") {
    return refundWasPostDelivery(o) ? "success" : "info";
  }
  const s = o.status;
  if (s === "delivered") return "success";
  if (s === "cancelled") return "danger";
  if (s === "paid" || s === "processing" || s === "sent_for_delivery") return "info";
  return "warn";
}
