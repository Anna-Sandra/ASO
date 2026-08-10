import type { HydratedDocument } from "mongoose";
import type { OrderDoc, OrderPaymentStatus } from "./order.model";

/** Mark platform escrow hold after successful buyer payment. */
export function setOrderPaymentHeld(order: HydratedDocument<OrderDoc> | OrderDoc): void {
  (order as { paymentStatus?: OrderPaymentStatus }).paymentStatus = "held";
}

export function isDeliveryConfirmedForPayout(order: {
  deliveryConfirmation?: { confirmed?: boolean } | null;
  fulfillmentMode?: string;
}): boolean {
  if (order.fulfillmentMode === "onsite") return true;
  return Boolean(order.deliveryConfirmation?.confirmed);
}
