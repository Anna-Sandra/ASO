import mongoose, { Schema } from "mongoose";

export type UserRole = "buyer" | "seller" | "admin";

/** Tokens or legacy users may omit or corrupt `role`; shop routes treat unknown as buyer. */
export function normalizeUserRole(role: unknown): UserRole {
  if (role === "buyer" || role === "seller" || role === "admin") return role;
  return "buyer";
}

export interface UserDoc {
  _id: mongoose.Types.ObjectId;
  email?: string;
  passwordHash: string;
  role: UserRole;
  emailVerifiedAt?: Date | null;
  displayName?: string;
  phone?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
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
    phone: { type: String, required: false, unique: true, sparse: true, trim: true },
    bankName: { type: String, default: "", trim: true },
    bankAccountNumber: { type: String, default: "", trim: true },
    bankAccountName: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

export const User = mongoose.model<UserDoc>("User", userSchema);

