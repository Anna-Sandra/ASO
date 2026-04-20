import { z } from "zod";
import { VENDOR_ANALYTICS_EVENT_TYPES, type VendorAnalyticsEventType } from "./vendorAnalyticsEvent.model";

const eventTypeSet = new Set<string>(VENDOR_ANALYTICS_EVENT_TYPES);

export const vendorAnalyticsEventBodySchema = z.object({
  type: z
    .string()
    .trim()
    .refine((t): t is VendorAnalyticsEventType => eventTypeSet.has(t), "Invalid event type"),
  productId: z.string().trim().min(1).optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});
