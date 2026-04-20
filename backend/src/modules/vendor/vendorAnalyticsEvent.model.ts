import mongoose, { Schema } from "mongoose";

/** Vendor-side UI / hub events for analytics charts (not buyer PII). */
export const VENDOR_ANALYTICS_EVENT_TYPES = [
  "analytics_view",
  "dashboard_view",
  "products_list_view",
  "orders_view",
  "product_edit_view",
  "order_status_update"
] as const;

export type VendorAnalyticsEventType = (typeof VENDOR_ANALYTICS_EVENT_TYPES)[number];

export interface VendorAnalyticsEventDoc {
  _id: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  type: VendorAnalyticsEventType;
  productId?: mongoose.Types.ObjectId | null;
  meta?: Record<string, unknown> | null;
  createdAt: Date;
}

const vendorAnalyticsEventSchema = new Schema<VendorAnalyticsEventDoc>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, enum: [...VENDOR_ANALYTICS_EVENT_TYPES], index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    meta: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

vendorAnalyticsEventSchema.index({ sellerId: 1, createdAt: -1 });
vendorAnalyticsEventSchema.index({ sellerId: 1, type: 1, createdAt: -1 });

export const VendorAnalyticsEvent = mongoose.model<VendorAnalyticsEventDoc>(
  "VendorAnalyticsEvent",
  vendorAnalyticsEventSchema
);
