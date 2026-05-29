import mongoose, { Schema } from "mongoose";

export const PRODUCT_CATEGORIES = [
  "food_drinks",
  "fashion_accessories",
  "electronics_gadgets",
  "beauty_personal_care",
  "babies_infants",
  "services",
  "books_academic",
  "groceries_essentials"
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ProductStatus = "draft" | "pending_approval" | "active" | "rejected";

export const LISTING_KINDS = ["catalog", "menu", "service"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export type ProductAddonDoc = { label: string; priceDelta: number };

export interface ProductDoc {
  _id: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  /** Optional link to a seller-owned business store (multi-vendor storefront). */
  businessId?: mongoose.Types.ObjectId | null;
  menuSectionId?: mongoose.Types.ObjectId | null;
  /** Drives category-specific listing/edit UX; omitted treated as catalog semantics. */
  listingKind?: ListingKind;
  prepTimeMinutes?: number | null;
  addons?: ProductAddonDoc[];
  name: string;
  description: string;
  category: ProductCategory;
  /** Fine-grained listing type inside the marketplace parent category — drives buyer keyword search (see marketplace subcategory catalog). */
  subcategory?: string | null;
  /** Computed synonym blob for Atlas text / regex fallback; refreshed when category or subcategory changes. */
  listingSearchAssist?: string;
  /** Category-specific listing fields validated by category on write. */
  categoryAttributes?: Record<string, unknown>;
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

const productAddonSchema = new Schema<ProductAddonDoc>(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    priceDelta: { type: Number, required: true, min: 0, default: 0 }
  },
  { _id: false }
);

const productSchema = new Schema<ProductDoc>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    menuSectionId: { type: Schema.Types.ObjectId, ref: "MenuSection", default: null, index: true },
    listingKind: { type: String, enum: LISTING_KINDS, default: undefined },
    prepTimeMinutes: { type: Number, min: 1, max: 10080, default: null },
    addons: { type: [productAddonSchema], default: [] },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: true, enum: PRODUCT_CATEGORIES },
    subcategory: { type: String, default: null, trim: true, maxlength: 64, index: true },
    listingSearchAssist: { type: String, default: "", maxlength: 1100 },
    categoryAttributes: { type: Schema.Types.Mixed, default: {} },
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
productSchema.index({ businessId: 1, status: 1 });
/** Full-text on listings — `listingSearchAssist` carries Marketplace subcategory keywords without polluting storefront badge tags. */
productSchema.index({ name: "text", description: "text", tags: "text", listingSearchAssist: "text" });

export const Product = mongoose.model<ProductDoc>("Product", productSchema);
