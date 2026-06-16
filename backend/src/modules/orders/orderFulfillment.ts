import type { OrderDoc } from "./order.model";

export type FulfillmentMode = "delivery" | "onsite";

export function isOnsiteFulfillmentOrder(order: { fulfillmentMode?: FulfillmentMode | string | null }): boolean {
  return order.fulfillmentMode === "onsite";
}

/** All line items must be marketplace services — no courier delivery. */
export function fulfillmentModeForProductCategories(categories: Array<string | undefined>): FulfillmentMode {
  if (!categories.length) return "delivery";
  return categories.every((c) => c === "services") ? "onsite" : "delivery";
}

export function fulfillmentModeForOrderDoc(order: Pick<OrderDoc, "fulfillmentMode">): FulfillmentMode {
  return isOnsiteFulfillmentOrder(order) ? "onsite" : "delivery";
}
