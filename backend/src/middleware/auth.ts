import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { isBootstrapAdminJwtSub } from "../config/bootstrapAdmin";
import { isSuperUserAdminEmail } from "../config/env";
import { HttpError } from "../utils/httpError";
import { asyncHandler } from "../utils/asyncHandler";
import { effectiveTokenAdminLevel, verifyAccessToken } from "../modules/auth/jwt";
import { User, normalizeUserRole, type UserRole } from "../modules/auth/user.model";
import type { AdminLevel } from "../modules/auth/user.model";

function accountStatusMessage(status: string): string {
  if (status === "banned") return "This account is banned.";
  return "This account is suspended. Contact support if you think this is a mistake.";
}

function applyDbUserToRequest(
  req: Request,
  sub: string,
  user: { role: unknown; accountStatus?: string; email?: string | null }
) {
  const acc = (user as { accountStatus?: string }).accountStatus;
  if (acc && acc !== "active") {
    throw new HttpError(403, accountStatusMessage(acc));
  }
  const role = normalizeUserRole(user.role);
  const adminLevel: AdminLevel | undefined =
    role === "admin" ? (isSuperUserAdminEmail(user.email) ? "super" : "normal") : undefined;
  req.user = {
    id: sub,
    role,
    ...(role === "admin" && adminLevel ? { adminLevel } : {})
  };
}

function applyBootstrapUserToRequest(req: Request, sub: string) {
  req.user = { id: sub, role: "admin", adminLevel: "super" };
}

/** Bearer JWT + live DB role/account check (no stale role or suspended access). */
export const protect = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Unauthorized");
  const token = header.slice("Bearer ".length);

  let payload: { sub: string; role: string; al?: "super" | "normal" };
  try {
    payload = verifyAccessToken(token) as { sub: string; role: string; al?: "super" | "normal" };
  } catch {
    throw new HttpError(401, "Unauthorized");
  }

  if (isBootstrapAdminJwtSub(payload.sub)) {
    applyBootstrapUserToRequest(req, payload.sub);
    return next();
  }

  if (mongoose.connection.readyState !== 1) {
    const role = normalizeUserRole(payload.role);
    const al = effectiveTokenAdminLevel(payload) as AdminLevel | undefined;
    req.user = { id: payload.sub, role, ...(role === "admin" && al ? { adminLevel: al } : {}) };
    return next();
  }

  const user = await User.findById(payload.sub).select("role accountStatus email").lean();
  if (!user) throw new HttpError(401, "Unauthorized");
  applyDbUserToRequest(req, payload.sub, user);
  next();
});

/** Sets req.user when a valid Bearer token is present; invalid/suspended tokens are ignored. */
export const optionalProtect = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token) as { sub: string; role: string; al?: "super" | "normal" };
    if (isBootstrapAdminJwtSub(payload.sub)) {
      applyBootstrapUserToRequest(req, payload.sub);
      return next();
    }
    if (mongoose.connection.readyState !== 1) {
      const role = normalizeUserRole(payload.role);
      const al = effectiveTokenAdminLevel(payload) as AdminLevel | undefined;
      req.user = { id: payload.sub, role, ...(role === "admin" && al ? { adminLevel: al } : {}) };
      return next();
    }
    const user = await User.findById(payload.sub).select("role accountStatus email").lean();
    if (!user) return next();
    const acc = (user as { accountStatus?: string }).accountStatus;
    if (acc && acc !== "active") return next();
    applyDbUserToRequest(req, payload.sub, user);
  } catch {
    /* treat as anonymous */
  }
  next();
});

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Unauthorized"));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, "You do not have permission to use this feature."));
    next();
  };
}

/** Vendor/courier application ID uploads: guests allowed; signed-in shoppers allowed; other roles blocked. */
export function authorizeGuestOrBuyerApplicationUpload(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next();
  if (req.user.role === "buyer") return next();
  next(
    new HttpError(
      403,
      "Use a shopper account to upload ID while signed in, or sign out and apply as a guest."
    )
  );
}

/** Use after protect + admin routes: only JWT `al: "super"` (or bootstrap env admin). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin" || req.user?.adminLevel !== "super") {
    return next(new HttpError(403, "This action is limited to the platform super admin."));
  }
  next();
}
