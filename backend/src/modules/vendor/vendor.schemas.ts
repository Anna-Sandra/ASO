import { z } from "zod";
import { VENDOR_ANALYTICS_EVENT_TYPES, type VendorAnalyticsEventType } from "./vendorAnalyticsEvent.model";

const eventTypeSet = new Set<string>(VENDOR_ANALYTICS_EVENT_TYPES);

export const paystackPayoutAccountSchema = z.object({
  bankCode: z.string().trim().min(1).max(32),
  accountNumber: z.string().trim().min(1).max(20).optional(),
  /** Must match the selected list row (ghipss = bank, mobile_money = MoMo). */
  recipientType: z.enum(["ghipss", "mobile_money"]).default("ghipss")
});

export const vendorAnalyticsEventBodySchema = z.object({
  type: z
    .string()
    .trim()
    .refine((t): t is VendorAnalyticsEventType => eventTypeSet.has(t), "Invalid event type"),
  productId: z.string().trim().min(1).optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});
