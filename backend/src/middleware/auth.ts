import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import { effectiveTokenAdminLevel, verifyAccessToken } from "../modules/auth/jwt";
import { normalizeUserRole, type UserRole } from "../modules/auth/user.model";
import type { AdminLevel } from "../modules/auth/user.model";

export function protect(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new HttpError(401, "Unauthorized"));
  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token) as { sub: string; role: string; al?: "super" | "normal" };
    const role = normalizeUserRole(payload.role);
    const al = effectiveTokenAdminLevel(payload) as AdminLevel | undefined;
    req.user = { id: payload.sub, role, ...(role === "admin" && al ? { adminLevel: al } : {}) };
    next();
  } catch {
    next(new HttpError(401, "Unauthorized"));
  }
}

/** Sets req.user when a valid Bearer token is present; otherwise continues without user. */
export function optionalProtect(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token) as { sub: string; role: string; al?: "super" | "normal" };
    const role = normalizeUserRole(payload.role);
    const al = effectiveTokenAdminLevel(payload) as AdminLevel | undefined;
    req.user = { id: payload.sub, role, ...(role === "admin" && al ? { adminLevel: al } : {}) };
  } catch {
    /* ignore invalid token for public reads */
  }
  next();
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Unauthorized"));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, "Forbidden"));
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

