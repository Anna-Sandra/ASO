import mongoose, { Schema } from "mongoose";

/** Granular courier workflow — complements legacy `Order.status`. */
export type DeliveryStage =
  | "order_placed"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export const DELIVERY_STAGES: DeliveryStage[] = [
  "order_placed",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled"
];

export interface DeliveryHistoryEntry {
  stage: DeliveryStage;
  at: Date;
  byUserId?: mongoose.Types.ObjectId | null;
  note?: string;
}

export interface DeliveryDoc {
  _id: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  assignedRiderId?: mongoose.Types.ObjectId | null;
  currentStage: DeliveryStage;
  dropoffLatitude?: number | null;
  dropoffLongitude?: number | null;
  dropoffLabel?: string;
  riderLatitude?: number | null;
  riderLongitude?: number | null;
  riderLocationUpdatedAt?: Date | null;
  /** Optional ETA in minutes riders/admins may set */
  estimatedArrivalMinutes?: number | null;
  statusHistory: DeliveryHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const historySchema = new Schema<DeliveryHistoryEntry>(
  {
    stage: { type: String, enum: DELIVERY_STAGES, required: true },
    at: { type: Date, required: true, default: Date.now },
    byUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "", maxlength: 400 }
  },
  { _id: false }
);

const deliverySchema = new Schema<DeliveryDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true, index: true },
    assignedRiderId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    currentStage: { type: String, enum: DELIVERY_STAGES, default: "order_placed", index: true },
    dropoffLatitude: { type: Number, default: null },
    dropoffLongitude: { type: Number, default: null },
    dropoffLabel: { type: String, default: "", maxlength: 500 },
    riderLatitude: { type: Number, default: null },
    riderLongitude: { type: Number, default: null },
    riderLocationUpdatedAt: { type: Date, default: null },
    estimatedArrivalMinutes: { type: Number, default: null, min: 0, max: 10080 },
    statusHistory: { type: [historySchema], default: [] }
  },
  { timestamps: true }
);

export const Delivery = mongoose.model<DeliveryDoc>("Delivery", deliverySchema);
