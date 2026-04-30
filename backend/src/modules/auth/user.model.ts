import mongoose, { Schema } from "mongoose";

export type UserRole = "buyer" | "seller" | "admin";

/** In JWT and session: super admins may grant admin to other users. */
export type AdminLevel = "super" | "normal";

/** Tokens or legacy users may omit or corrupt `role`; shop routes treat unknown as buyer. */
export function normalizeUserRole(role: unknown): UserRole {
  if (role === "buyer" || role === "seller" || role === "admin") return role;
  return "buyer";
}

/** Expose phone only for sellers (MoMo / buyer payment contact). Hidden for buyers and admins. */
export function publicPhoneForPaymentRole(role: UserRole, phone?: string | null): string {
  if (role !== "seller") return "";
  return typeof phone === "string" ? phone.trim() : "";
}

export type AccountStatus = "active" | "suspended" | "banned";

/** Buyer vendor onboarding; sellers use `approved` once promoted. */
export type VendorProfileStatus = "none" | "pending" | "approved" | "rejected";

export interface UserDoc {
  _id: mongoose.Types.ObjectId;
  email?: string;
  passwordHash: string;
  role: UserRole;
  emailVerifiedAt?: Date | null;
  displayName?: string;
  phone?: string;
  /** Shop moderation: blocked accounts cannot use protected APIs. */
  accountStatus?: AccountStatus;
  /** Admin/trust: visible on seller profile when set. */
  sellerVerified?: boolean;
  /** Buyer: vendor application state. After approval, role becomes seller and this is approved. */
  vendorStatus?: VendorProfileStatus;
  /** Shop / business name (set when vendor application is approved). */
  businessName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  /** Ghana Interbank: bank `code` from `GET /bank?country=ghana&currency=GHS` (for Paystack payouts). */
  ghanaBankCode?: string;
  /** Paystack transfer recipient: `ghipss` (bank) or `mobile_money` (MoMo). */
  ghanaPayoutChannel?: "ghipss" | "mobile_money";
  /** Paystack `recipient_code` (GHIPSS) for automatic order payouts after online payment. */
  paystackTransferRecipientCode?: string;
  /** Paystack `subaccount_code` (e.g. ACCT_…) for split checkout; created with payout bank/MoMo registration. */
  paystackSubaccountCode?: string;
  /** Public URL to profile picture (e.g. `/uploads/avatars/…`). */
  profileImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: false, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ["buyer", "seller", "admin"], default: "buyer" },
    emailVerifiedAt: { type: Date, default: null },
    displayName: { type: String, default: "" },
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active"
    },
    sellerVerified: { type: Boolean, default: false },
    vendorStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none"
    },
    businessName: { type: String, default: "", trim: true, maxlength: 120 },
    phone: { type: String, required: false, unique: true, sparse: true, trim: true },
    bankName: { type: String, default: "", trim: true },
    bankAccountNumber: { type: String, default: "", trim: true },
    bankAccountName: { type: String, default: "", trim: true },
    ghanaBankCode: { type: String, default: "", trim: true, maxlength: 32 },
    ghanaPayoutChannel: { type: String, enum: ["ghipss", "mobile_money"], required: false },
    paystackTransferRecipientCode: { type: String, default: "", trim: true, maxlength: 64 },
    paystackSubaccountCode: { type: String, default: "", trim: true, maxlength: 64 },
    profileImageUrl: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

export const User = mongoose.model<UserDoc>("User", userSchema);

