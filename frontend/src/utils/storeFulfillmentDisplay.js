import { formatGhc } from "utils/money";

/**
 * Public-store copy for pickup / delivery (shared by shopper storefront + vendor preview).
 */
export function buildStoreFulfillmentDisplay(business) {
  const pickupOk = Boolean(business?.pickupAvailable);
  const deliveryOk = Boolean(business?.deliveryAvailable);

  const etaRange =
    deliveryOk && business?.estimatedDeliveryMins != null
      ? `${Math.max(5, business.estimatedDeliveryMins - 8)}–${business.estimatedDeliveryMins + 12} min`
      : null;

  const deliveryFeeText =
    deliveryOk &&
    business?.deliveryFee != null &&
    Number.isFinite(Number(business.deliveryFee)) &&
    Number(business.deliveryFee) > 0
      ? `${formatGhc(Number(business.deliveryFee))} delivery`
      : null;

  const serviceSnippet =
    [pickupOk && "Pickup", deliveryOk && "Delivery"].filter(Boolean).join(" · ") || "Contact seller";

  let fulfillmentTile;
  if (pickupOk && deliveryOk) {
    const parts = [];
    if (deliveryFeeText) parts.push(deliveryFeeText);
    else parts.push("Delivery available");
    if (etaRange) parts.push(etaRange);
    parts.push("Pickup available");
    fulfillmentTile = parts.join(" · ");
  } else if (deliveryOk) {
    fulfillmentTile =
      deliveryFeeText || (etaRange ? `${etaRange} delivery` : "Delivery — confirm fee with seller");
  } else if (pickupOk) {
    fulfillmentTile = "Pickup — arrange with seller";
  } else {
    fulfillmentTile = "Contact seller";
  }

  const locationSnippet = business?.locationLabel?.trim()
    ? String(business.locationLabel).trim()
    : pickupOk && deliveryOk
      ? "Pickup and delivery offered — message the seller for pickup address / delivery zones."
      : deliveryOk && !pickupOk
        ? "Delivery offered — seller will confirm zones and timing."
        : pickupOk && !deliveryOk
          ? "Pickup — message the seller for pickup details."
          : "How to get your order — message the seller.";

  /** Hero / manager chips — separate pickup when both options exist. */
  const heroChips = [];
  if (pickupOk && deliveryOk) {
    heroChips.push({ key: "pickup", label: "Pickup", icon: "pickup" });
  }
  if (deliveryOk && etaRange) {
    heroChips.push({ key: "eta", label: etaRange, icon: "clock" });
  }
  if (deliveryOk && deliveryFeeText) {
    heroChips.push({ key: "fee", label: deliveryFeeText, icon: "truck" });
  } else if (deliveryOk && !pickupOk) {
    heroChips.push({ key: "del", label: "Delivery", icon: "truck" });
  } else if (!deliveryOk && pickupOk) {
    heroChips.push({ key: "pickup-only", label: "Pickup — arrange with seller", icon: "truck" });
  }

  return {
    pickupOk,
    deliveryOk,
    etaRange,
    deliveryFeeText,
    serviceSnippet,
    fulfillmentTile,
    locationSnippet,
    heroChips
  };
}
