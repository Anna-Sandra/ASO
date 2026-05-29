import mongoose, { Schema } from "mongoose";
import type { ProductCategory } from "../products/product.model";

export const BUSINESS_TYPES = [
  "food_restaurant",
  "fashion_store",
  "electronics_shop",
  "beauty_shop",
  "baby_infant_store",
  "grocery_store",
  "academic_book",
  "service_provider"
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export type BusinessStatus = "draft" | "pending_approval" | "active" | "rejected" | "suspended";

/** Day-local hours (presentation only; timezone rules can be layered later). */
export type BusinessDayHours = { open?: string; close?: string; closed?: boolean };

export interface BusinessDoc {
  _id: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  slug: string;
  businessType: BusinessType;
  status: BusinessStatus;
  /** Display brand name ("SHOPIQGH"). */
  name: string;
  description: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  contactPhone?: string;
  contactEmail?: string;
  locationLabel?: string;
  /** Latitude / longitude — optional MVP; future map picker writes here. */
  geoLocation?: { lat: number; lng: number } | null;
  /** Kilometers; used for policy/messaging; enforcement can evolve. */
  deliveryRadiusKm?: number | null;
  operatingHours?: Record<string, BusinessDayHours>;
  tags: string[];
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  estimatedDeliveryMins?: number | null;
  deliveryFee?: number | null;
  /** Category-specific toggles — e.g. services take requests online. */
  settings?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const businessSchema = new Schema<BusinessDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120, unique: true },
    businessType: { type: String, required: true, enum: BUSINESS_TYPES, index: true },
    status: {
      type: String,
      enum: ["draft", "pending_approval", "active", "rejected", "suspended"],
      default: "draft",
      index: true
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 8000 },
    logoUrl: { type: String, default: null, maxlength: 500 },
    bannerUrl: { type: String, default: null, maxlength: 500 },
    contactPhone: { type: String, default: "", maxlength: 32 },
    contactEmail: { type: String, default: "", lowercase: true, trim: true, maxlength: 200 },
    locationLabel: { type: String, default: "", maxlength: 500 },
    geoLocation: {
      lat: { type: Number },
      lng: { type: Number }
    },
    deliveryRadiusKm: { type: Number, min: 0, max: 500, default: null },
    operatingHours: { type: Schema.Types.Mixed, default: {} },
    tags: { type: [String], default: [] },
    deliveryAvailable: { type: Boolean, default: false },
    pickupAvailable: { type: Boolean, default: true },
    estimatedDeliveryMins: { type: Number, min: 1, max: 10080, default: null },
    deliveryFee: { type: Number, min: 0, default: null },
    settings: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

businessSchema.index({ businessType: 1, status: 1 });
businessSchema.index({ name: "text", description: "text", tags: "text" });

export const Business = mongoose.model<BusinessDoc>("Business", businessSchema);

/** Primary marketplace category for storefront listings belonging to each business archetype (soft validation helpers). */
export function primaryProductCategoryForBusinessType(bt: BusinessType): ProductCategory {
  switch (bt) {
    case "food_restaurant":
      return "food_drinks";
    case "fashion_store":
      return "fashion_accessories";
    case "electronics_shop":
      return "electronics_gadgets";
    case "beauty_shop":
      return "beauty_personal_care";
    case "baby_infant_store":
      return "babies_infants";
    case "grocery_store":
      return "groceries_essentials";
    case "academic_book":
      return "books_academic";
    case "service_provider":
    default:
      return "services";
  }
}
