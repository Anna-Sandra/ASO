import mongoose, { Schema } from "mongoose";

export type UserRole = "buyer" | "seller" | "admin" | "rider";

/** In JWT and session: super admins may grant admin to other users. */
export type AdminLevel = "super" | "normal";

/** Tokens or legacy users may omit or corrupt `role`; shop routes treat unknown as buyer. */
export function normalizeUserRole(role: unknown): UserRole {
  if (role === "buyer" || role === "seller" || role === "admin" || role === "rider") return role;
  return "buyer";
}

/** Expose phone for sellers (MoMo / buyer payment contact) and riders (delivery contact). Hidden for buyers and admins. */
export function publicPhoneForPaymentRole(role: UserRole, phone?: string | null): string {
  if (role !== "seller" && role !== "rider") return "";
  return typeof phone === "string" ? phone.trim() : "";
}

export type AccountStatus = "active" | "suspended" | "banned";

/** Buyer vendor onboarding; sellers use `approved` once promoted. */
export type VendorProfileStatus = "none" | "pending" | "approved" | "rejected";

/** Buyer: delivery partner application queue. Cleared when `role` becomes `rider`. */
export type RiderApplicationStatus = "none" | "pending" | "rejected";

/** Platform seller subscription (separate from buyer order payouts). */
export type VendorSubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "expired";

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
  /** Buyer: courier application state (self-serve apply). Not used once `role` is `rider`. */
  riderApplicationStatus?: RiderApplicationStatus;
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
  /** When admin approved the vendor application (seller role). */
  sellerApprovedAt?: Date | null;
  vendorSubscriptionStatus?: VendorSubscriptionStatus;
  /** Admin comp — never require seller platform fee. */
  vendorSubscriptionExempt?: boolean;
  vendorSubscriptionPaidAt?: Date | null;
  vendorSubscriptionExpiresAt?: Date | null;
  /** Paystack reference for an in-flight seller subscription checkout. */
  vendorSubscriptionPendingReference?: string;
  /** SHOPIQGH reward points (earn ~1 pt / GHS spent; redeem 100 pts = GHS 1 at checkout). */
  rewardPoints?: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: false, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ["buyer", "seller", "admin", "rider"], default: "buyer" },
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
    riderApplicationStatus: {
      type: String,
      enum: ["none", "pending", "rejected"],
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
    profileImageUrl: { type: String, default: "", trim: true },
    sellerApprovedAt: { type: Date, default: null },
    vendorSubscriptionStatus: {
      type: String,
      enum: ["none", "trialing", "active", "past_due", "expired"],
      default: "none"
    },
    vendorSubscriptionExempt: { type: Boolean, default: false },
    vendorSubscriptionPaidAt: { type: Date, default: null },
    vendorSubscriptionExpiresAt: { type: Date, default: null },
    vendorSubscriptionPendingReference: { type: String, default: "", trim: true, maxlength: 120 },
    rewardPoints: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

export const User = mongoose.model<UserDoc>("User", userSchema);

