import mongoose, { Schema } from "mongoose";

export type TokenPurpose = "email_verify" | "password_reset" | "refresh";

export interface TokenDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  purpose: TokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const tokenSchema = new Schema<TokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: {
      type: String,
      required: true,
      enum: ["email_verify", "password_reset", "refresh"],
      index: true
    },
    tokenHash: { type: String, required: true, select: false, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

tokenSchema.index({ purpose: 1, tokenHash: 1 }, { unique: true });
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Token = mongoose.model<TokenDoc>("Token", tokenSchema);

