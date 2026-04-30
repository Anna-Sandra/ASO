import mongoose, { Schema } from "mongoose";

export const PRODUCT_CATEGORIES = [
  "food_drinks",
  "fashion_accessories",
  "electronics_gadgets",
  "beauty_personal_care",
  "services",
  "books_academic",
  "groceries_essentials"
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ProductStatus = "draft" | "pending_approval" | "active" | "rejected";

export interface ProductDoc {
  _id: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  category: ProductCategory;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  status: ProductStatus;
  /** Set when a listing is rejected by an admin. */
  rejectionReason?: string;
  /** Admin moderation. */
  flagged?: boolean;
  tags: string[];
  imageUrls: string[];
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDoc>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: true, enum: PRODUCT_CATEGORIES },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0, default: null },
    stock: { type: Number, required: true, min: 0, default: 25 },
    status: { type: String, enum: ["draft", "pending_approval", "active", "rejected"], default: "draft" },
    rejectionReason: { type: String, default: null, maxlength: 2000 },
    flagged: { type: Boolean, default: false, index: true },
    tags: { type: [String], default: [] },
    imageUrls: { type: [String], default: [] }
  },
  { timestamps: true }
);

productSchema.index({ category: 1, status: 1 });
productSchema.index({ name: "text", description: "text" });

export const Product = mongoose.model<ProductDoc>("Product", productSchema);
