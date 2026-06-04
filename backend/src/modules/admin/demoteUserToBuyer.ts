import type { HydratedDocument } from "mongoose";
import mongoose from "mongoose";
import { isSuperUserAdminEmail } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { Token } from "../auth/token.model";
import { User, normalizeUserRole, type UserDoc, type UserRole } from "../auth/user.model";
import { RiderProfile } from "../deliveries/riderProfile.model";

export type DemotedFromRole = "admin" | "seller" | "rider";

export function roleDemotionMessage(from: DemotedFromRole): string {
  switch (from) {
    case "admin":
      return "Your administrator access was removed. Your account is now a buyer account. You can no longer sign in to the admin dashboard.";
    case "seller":
      return "Your seller access was removed. Your account is now a buyer account. You can no longer sign in to the vendor dashboard.";
    case "rider":
      return "Your courier access was removed. Your account is now a buyer account. You can no longer sign in to the rider dashboard.";
    default:
      return "Your account role was updated. You now have a buyer account.";
  }
}

async function revokeAllRefreshTokens(userId: mongoose.Types.ObjectId) {
  await Token.updateMany(
    { userId, purpose: "refresh", revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

export type DemoteUserResult = {
  user: HydratedDocument<UserDoc>;
  previousRole: DemotedFromRole;
  message: string;
};

/** Demote admin, seller, or rider to buyer; revoke sessions and set a one-time login notice. */
export async function demoteUserToBuyer(
  u: HydratedDocument<UserDoc>,
  opts: { previousRole: DemotedFromRole }
): Promise<DemoteUserResult> {
  const current = normalizeUserRole(u.role);
  if (current === "buyer") {
    throw new HttpError(400, "This account is already a buyer.");
  }
  if (opts.previousRole === "admin" && current !== "admin") {
    throw new HttpError(400, "This account is not an administrator.");
  }
  if (opts.previousRole === "seller" && current !== "seller") {
    throw new HttpError(400, "This account is not a seller.");
  }
  if (opts.previousRole === "rider" && current !== "rider") {
    throw new HttpError(400, "This account is not a rider.");
  }

  const message = roleDemotionMessage(opts.previousRole);
  u.role = "buyer";
  (u as { roleDemotionNotice?: { fromRole: DemotedFromRole; message: string; at: Date } }).roleDemotionNotice = {
    fromRole: opts.previousRole,
    message,
    at: new Date()
  };
  u.markModified("roleDemotionNotice");

  if (opts.previousRole === "admin") {
    (u as { adminPermissions?: Record<string, boolean> }).adminPermissions = undefined;
    u.markModified("adminPermissions");
  }

  if (opts.previousRole === "seller") {
    (u as { sellerVerified?: boolean }).sellerVerified = false;
    (u as { vendorStatus?: string }).vendorStatus = "none";
  }

  if (opts.previousRole === "rider") {
    (u as { riderApplicationStatus?: string }).riderApplicationStatus = "none";
    await RiderProfile.deleteMany({ userId: u._id });
  }

  await u.save();
  await revokeAllRefreshTokens(u._id);

  return { user: u, previousRole: opts.previousRole, message };
}

export function assertCanDemoteAdminTarget(email: string | undefined, adminCount: number) {
  if (isSuperUserAdminEmail(email)) {
    throw new HttpError(403, "Cannot remove admin from a platform super-admin account.");
  }
  if (adminCount <= 1) {
    throw new HttpError(400, "Cannot remove the only administrator. Grant another admin first.");
  }
}

export function demotedFromRoleForUser(role: UserRole): DemotedFromRole | null {
  if (role === "admin" || role === "seller" || role === "rider") return role;
  return null;
}
