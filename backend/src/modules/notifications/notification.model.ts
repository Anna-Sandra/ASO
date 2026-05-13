import mongoose, { Schema } from "mongoose";

export type NotificationType =
  | "order_placed"
  | "payment_submitted"
  | "admin_payment_confirmed"
  | "payment_received"
  | "order_status_change"
  | "order_cancelled"
  | "refund_processed"
  | "dispute_opened"
  | "message_received"
  | "listing_decision"
  | "vendor_application_decision";

export interface NotificationDoc {
  _id: mongoose.Types.ObjectId;
  /** Recipient user ID (vendor/admin/buyer). */
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  /** Human readable title. */
  title: string;
  /** Message body. */
  message: string;
  /** Related order ID (if applicable). */
  orderId?: mongoose.Types.ObjectId | null;
  /** Whether user has read this notification. */
  read: boolean;
  /** Timestamp when read, if applicable. */
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NOTIFICATION_TYPES: NotificationType[] = [
  "order_placed",
  "payment_submitted",
  "admin_payment_confirmed",
  "payment_received",
  "order_status_change",
  "order_cancelled",
  "refund_processed",
  "dispute_opened",
  "message_received",
  "listing_decision",
  "vendor_application_decision"
];

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model<NotificationDoc>("Notification", notificationSchema);
