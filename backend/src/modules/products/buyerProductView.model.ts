import mongoose, { Schema } from "mongoose";

/**
 * Last-seen timestamp per buyer ↔ product for personalization (recommendations, assistant context).
 * One row per pair; `viewedAt` updates on repeat visits.
 */
export interface BuyerProductViewDoc {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  viewedAt: Date;
}

const buyerProductViewSchema = new Schema<BuyerProductViewDoc>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    viewedAt: { type: Date, default: () => new Date() }
  },
  { timestamps: false }
);

buyerProductViewSchema.index({ buyerId: 1, productId: 1 }, { unique: true });
buyerProductViewSchema.index({ buyerId: 1, viewedAt: -1 });

export const BuyerProductView = mongoose.model<BuyerProductViewDoc>("BuyerProductView", buyerProductViewSchema);
