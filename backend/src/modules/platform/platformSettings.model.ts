import mongoose, { Schema } from "mongoose";

export interface PlatformSettingsDoc {
  _id: mongoose.Types.ObjectId;
  /** Single row: commission % used for new checkouts and displayed in admin (overrides .env default when set). */
  commissionPercent: number;
  momoEnabled: boolean;
  stripeEnabled: boolean;
  bankEnabled: boolean;
  /** Long-form policy text (shown in admin, optional for storefront later). */
  listingPolicyNote: string;
  createdAt: Date;
  updatedAt: Date;
}

const platformSettingsSchema = new Schema<PlatformSettingsDoc>(
  {
    commissionPercent: { type: Number, required: true, min: 0, max: 100, default: 7 },
    momoEnabled: { type: Boolean, default: true },
    stripeEnabled: { type: Boolean, default: true },
    bankEnabled: { type: Boolean, default: true },
    listingPolicyNote: { type: String, default: "", maxlength: 10000 }
  },
  { timestamps: true }
);

export const PlatformSettings = mongoose.model<PlatformSettingsDoc>("PlatformSettings", platformSettingsSchema);
