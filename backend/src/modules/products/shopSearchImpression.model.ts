import mongoose, { Schema } from "mongoose";

/** Shop search queries that surfaced a seller's listings (for vendor analytics). */
export interface ShopSearchImpressionDoc {
  _id: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  query: string;
  createdAt: Date;
}

const shopSearchImpressionSchema = new Schema<ShopSearchImpressionDoc>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    query: { type: String, required: true, trim: true, maxlength: 120 },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: false }
);

shopSearchImpressionSchema.index({ sellerId: 1, createdAt: -1 });
shopSearchImpressionSchema.index({ sellerId: 1, query: 1, createdAt: -1 });

export const ShopSearchImpression = mongoose.model<ShopSearchImpressionDoc>(
  "ShopSearchImpression",
  shopSearchImpressionSchema
);
