import mongoose from "mongoose";
import { env } from "../../config/env";
import { User } from "../auth/user.model";

/** Anchor user for marketplace support threads (`kind: "support"`): `buyerId` = customer, `sellerId` = this admin. */
export async function getPrimarySupportAdminId(): Promise<mongoose.Types.ObjectId | null> {
  const boot = (env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  if (boot) {
    const u = await User.findOne({ email: boot }).select("_id role").lean();
    if (u && String((u as { role?: string }).role) === "admin") {
      return u._id as mongoose.Types.ObjectId;
    }
  }
  const u = await User.findOne({ role: "admin" }).sort({ createdAt: 1 }).select("_id").lean();
  return u ? (u._id as mongoose.Types.ObjectId) : null;
}
