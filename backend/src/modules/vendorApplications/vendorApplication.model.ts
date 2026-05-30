import mongoose, { Schema } from "mongoose";
import { PRODUCT_CATEGORIES } from "../products/product.model";
import { VENDOR_LOCATION_BASE } from "./vendorApplication.schemas";

export type VendorApplicationStatus = "pending" | "approved" | "rejected";
export type VendorLocationBase = (typeof VENDOR_LOCATION_BASE)[number];

export interface VendorApplicationDoc {
  _id: mongoose.Types.ObjectId;
  /** Set when applicant was signed in; guest applications use email only until an admin links an account on approval. */
  userId?: mongoose.Types.ObjectId | null;
  fullName: string;
  email: string;
  shopName: string;
  category: string;
  sellsDescription: string;
  phone: string;
  altPhone: string;
  shopDescription: string;
  verificationDocUrl: string;
  locationBase: VendorLocationBase;
  nearbyArea: string;
  status: VendorApplicationStatus;
  adminNote: string;
  reviewedAt?: Date | null;
  /** SHA-256 hex of activation token sent by email; cleared after account activation. */
  activationTokenHash?: string | null;
  activationExpiry?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const vendorApplicationSchema = new Schema<VendorApplicationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false, default: null, index: true, sparse: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    shopName: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, enum: PRODUCT_CATEGORIES },
    sellsDescription: { type: String, required: true, trim: true, maxlength: 200 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    altPhone: { type: String, default: "", trim: true, maxlength: 40 },
    shopDescription: { type: String, required: true, trim: true, maxlength: 300 },
    verificationDocUrl: { type: String, default: "", trim: true, maxlength: 500 },
    locationBase: { type: String, required: true, enum: [...VENDOR_LOCATION_BASE] },
    nearbyArea: { type: String, required: true, trim: true, maxlength: 200 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true
    },
    adminNote: { type: String, default: "", maxlength: 2000 },
    reviewedAt: { type: Date, default: null },
    activationTokenHash: { type: String, default: null, index: true, sparse: true },
    activationExpiry: { type: Date, default: null }
  },
  { timestamps: true }
);

vendorApplicationSchema.index({ userId: 1, status: 1 });

export const VendorApplication = mongoose.model<VendorApplicationDoc>("VendorApplication", vendorApplicationSchema);
