import mongoose, { Schema } from "mongoose";

export interface CartSnapshotLine {
  productId: mongoose.Types.ObjectId;
  quantity: number;
}

export interface CartSnapshotDoc {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  items: CartSnapshotLine[];
  updatedAt: Date;
  abandonedReminderSentAt?: Date | null;
}

const cartSnapshotSchema = new Schema<CartSnapshotDoc>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    items: {
      type: [
        {
          productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
          quantity: { type: Number, required: true, min: 1, max: 99 }
        }
      ],
      default: []
    },
    abandonedReminderSentAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const CartSnapshot = mongoose.model<CartSnapshotDoc>("CartSnapshot", cartSnapshotSchema);
