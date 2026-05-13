import mongoose, { Schema } from "mongoose";

export interface PlatformSettingsDoc {
  _id: mongoose.Types.ObjectId;
  /** Single row: commission % used for new checkouts and displayed in admin (overrides .env default when set). */
  commissionPercent: number;
  momoEnabled: boolean;
  stripeEnabled: boolean;
  bankEnabled: boolean;
  /**
   * Freeform / legacy notes. Prefer structured fields below for moderation UX; this is optional extra.
   */
  listingPolicyNote: string;
  listingAllowedItemsNote: string;
  listingProhibitedItemsNote: string;
  listingModerationGuidelines: string;
  /** Lowercased matching; max length enforced in API (see admin schema). */
  listingAutoRejectKeywords: string[];
  listingAutoModerationEnabled: boolean;
  listingKeywordBlockEnabled: boolean;
  /** New seller submissions: skip queue vs pending admin. Edits to live listings always re-queue. */
  listingDefaultApprovalMode: "require_approval" | "auto_approve";
  listingKeywordViolationAction: "reject_auto" | "flag_review";
  listingRulesVersion: number;
  listingRulesUpdatedAt: Date | null;
  listingRulesUpdatedByUserId: mongoose.Types.ObjectId | null;
  listingRulesAuditTail: { at: Date; actorUserId: string; summary: string }[];
  siteName: string;
  siteDescription: string;
  supportEmail: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowPublicRegistration: boolean;
  allowVendorApplications: boolean;
  allowCourierApplications: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const listingAuditEntrySchema = new Schema(
  {
    at: { type: Date, required: true },
    actorUserId: { type: String, required: true },
    summary: { type: String, required: true, maxlength: 500 }
  },
  { _id: false }
);

const platformSettingsSchema = new Schema<PlatformSettingsDoc>(
  {
    commissionPercent: { type: Number, required: true, min: 0, max: 100, default: 5 },
    momoEnabled: { type: Boolean, default: true },
    stripeEnabled: { type: Boolean, default: true },
    bankEnabled: { type: Boolean, default: true },
    listingPolicyNote: { type: String, default: "", maxlength: 10000 },
    listingAllowedItemsNote: { type: String, default: "", maxlength: 8000 },
    listingProhibitedItemsNote: { type: String, default: "", maxlength: 8000 },
    listingModerationGuidelines: { type: String, default: "", maxlength: 8000 },
    listingAutoRejectKeywords: { type: [String], default: [] },
    listingAutoModerationEnabled: { type: Boolean, default: false },
    listingKeywordBlockEnabled: { type: Boolean, default: false },
    listingDefaultApprovalMode: {
      type: String,
      enum: ["require_approval", "auto_approve"],
      default: "require_approval"
    },
    listingKeywordViolationAction: {
      type: String,
      enum: ["reject_auto", "flag_review"],
      default: "flag_review"
    },
    listingRulesVersion: { type: Number, default: 1, min: 1 },
    listingRulesUpdatedAt: { type: Date, default: null },
    listingRulesUpdatedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    listingRulesAuditTail: { type: [listingAuditEntrySchema], default: [] },
    siteName: { type: String, default: "Campus Mart", maxlength: 120 },
    siteDescription: { type: String, default: "", maxlength: 1000 },
    supportEmail: { type: String, default: "", maxlength: 200 },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: "", maxlength: 2000 },
    allowPublicRegistration: { type: Boolean, default: true },
    allowVendorApplications: { type: Boolean, default: true },
    allowCourierApplications: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const PlatformSettings = mongoose.model<PlatformSettingsDoc>("PlatformSettings", platformSettingsSchema);
