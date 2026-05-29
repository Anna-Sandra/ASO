import mongoose, { Schema } from "mongoose";

export const PROMOTION_KINDS = [
  "banner",
  "flash_sale",
  "deal_discount",
  "deal_bundle",
  "spotlight",
  "vendor_promo",
  "coupon"
] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_REVIEW = ["pending", "approved", "rejected", "draft"] as const;
export type PromotionReviewStatus = (typeof PROMOTION_REVIEW)[number];

export interface PromotionDoc {
  _id: mongoose.Types.ObjectId;
  kind: PromotionKind;
  reviewStatus: PromotionReviewStatus;
  /** Vendor who created it; `null` for platform-created (admin) rows. */
  sellerId: mongoose.Types.ObjectId | null;
  businessId?: mongoose.Types.ObjectId | null;
  productId?: mongoose.Types.ObjectId | null;

  title: string;
  subtitle?: string;

  /** Coupon / code label */
  code?: string;
  discountPercent?: number | null;
  discountAmountGhs?: number | null;
  minOrderGhs?: number | null;
  freeDelivery?: boolean;

  compareAtGhs?: number | null;
  salePriceGhs?: number | null;

  startsAt?: Date | null;
  endsAt: Date;

  /** 0–100 for flash “% sold” bar */
  soldPercent?: number | null;

  tagBadge?: string;
  gradientKey?: string;
  imageUrl?: string | null;
  /** food_drinks | fashion_accessories | … for deal filters */
  categoryKey?: string | null;
  linkPath?: string | null;

  rejectionReason?: string | null;
  reviewedAt?: Date | null;
  reviewedBy?: mongoose.Types.ObjectId | null;

  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

const promotionSchema = new Schema<PromotionDoc>(
  {
    kind: { type: String, required: true, enum: PROMOTION_KINDS, index: true },
    reviewStatus: { type: String, required: true, enum: PROMOTION_REVIEW, default: "pending", index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null, index: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    subtitle: { type: String, default: "", trim: true, maxlength: 500 },

    code: { type: String, default: "", trim: true, uppercase: true, maxlength: 40 },
    discountPercent: { type: Number, default: null, min: 0, max: 100 },
    discountAmountGhs: { type: Number, default: null, min: 0 },
    minOrderGhs: { type: Number, default: null, min: 0 },
    freeDelivery: { type: Boolean, default: false },

    compareAtGhs: { type: Number, default: null, min: 0 },
    salePriceGhs: { type: Number, default: null, min: 0 },

    startsAt: { type: Date, default: null },
    endsAt: { type: Date, required: true, index: true },

    soldPercent: { type: Number, default: null, min: 0, max: 100 },

    tagBadge: { type: String, default: "", trim: true, maxlength: 24 },
    gradientKey: { type: String, default: "violet", trim: true, maxlength: 32 },
    imageUrl: { type: String, default: null, maxlength: 500 },
    categoryKey: { type: String, default: null, trim: true, maxlength: 64, index: true },
    linkPath: { type: String, default: null, trim: true, maxlength: 500 },

    rejectionReason: { type: String, default: null, maxlength: 2000 },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    priority: { type: Number, default: 0 }
  },
  { timestamps: true }
);

promotionSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $gt: "" } } });
promotionSchema.index({ kind: 1, reviewStatus: 1, endsAt: -1 });

export const Promotion = mongoose.model<PromotionDoc>("Promotion", promotionSchema);
