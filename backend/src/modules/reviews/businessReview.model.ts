import mongoose, { Schema } from "mongoose";

export interface BusinessReviewDoc {
  _id: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId | null;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const businessReviewSchema = new Schema<BusinessReviewDoc>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 2000 }
  },
  { timestamps: true }
);

businessReviewSchema.index({ businessId: 1, buyerId: 1 }, { unique: true });
businessReviewSchema.index({ businessId: 1, createdAt: -1 });

export const BusinessReview = mongoose.model<BusinessReviewDoc>("BusinessReview", businessReviewSchema);
