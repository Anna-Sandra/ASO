import mongoose, { Schema } from "mongoose";
import { PRODUCT_CATEGORIES } from "../products/product.model";

export type VendorApplicationStatus = "pending" | "approved" | "rejected";

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
  selfieUrl: string;
  faceMatchStatus: string;
  faceMatchConfidence?: number | null;
  faceMatchProvider?: string;
  faceMatchReason?: string;
  faceMatchCheckedAt?: Date | null;
  locationLat: number;
  locationLng: number;
  locationLabel: string;
  locationAccuracyM?: number | null;
  /** @deprecated Legacy campus fields — kept for older rows only. */
  locationBase?: string;
  nearbyArea?: string;
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
    selfieUrl: { type: String, default: "", trim: true, maxlength: 500 },
    faceMatchStatus: {
      type: String,
      enum: ["matched", "mismatch", "manual_review"],
      default: "manual_review"
    },
    faceMatchConfidence: { type: Number, default: null, min: 0, max: 100 },
    faceMatchProvider: { type: String, default: "none", trim: true, maxlength: 80 },
    faceMatchReason: { type: String, default: "", trim: true, maxlength: 400 },
    faceMatchCheckedAt: { type: Date, default: null },
    locationLat: { type: Number, required: true },
    locationLng: { type: Number, required: true },
    locationLabel: { type: String, default: "", trim: true, maxlength: 300 },
    locationAccuracyM: { type: Number, default: null, min: 0 },
    locationBase: { type: String, default: "", trim: true, maxlength: 40 },
    nearbyArea: { type: String, default: "", trim: true, maxlength: 200 },
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
