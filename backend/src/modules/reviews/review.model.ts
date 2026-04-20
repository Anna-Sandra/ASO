import mongoose, { Schema } from "mongoose";

export interface ReviewDoc {
  _id: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  /** Copied from the product at creation so vendors can list reviews even if $lookup fails or the listing was removed. */
  sellerId?: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId | null;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 2000 }
  },
  { timestamps: true }
);

reviewSchema.index({ productId: 1, buyerId: 1 }, { unique: true });
reviewSchema.index({ sellerId: 1, createdAt: -1 });

export const Review = mongoose.model<ReviewDoc>("Review", reviewSchema);
