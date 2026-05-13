import mongoose, { Schema } from "mongoose";

/**
 * Bookmarked storefront listings per visitor. `ownerKey` is either `u:<userId>` (any logged-in role)
 * or `g:<uuid>` (guest session header).
 */
export interface ProductSaveDoc {
  _id: mongoose.Types.ObjectId;
  ownerKey: string;
  productId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const productSaveSchema = new Schema<ProductSaveDoc>(
  {
    ownerKey: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

productSaveSchema.index({ ownerKey: 1, productId: 1 }, { unique: true });
productSaveSchema.index({ ownerKey: 1, createdAt: -1 });

export const ProductSave = mongoose.model<ProductSaveDoc>("ProductSave", productSaveSchema);
