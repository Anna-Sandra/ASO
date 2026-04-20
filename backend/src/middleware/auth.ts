import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import { verifyAccessToken } from "../modules/auth/jwt";
import { normalizeUserRole, type UserRole } from "../modules/auth/user.model";

export function protect(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new HttpError(401, "Unauthorized"));
  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: normalizeUserRole(payload.role) };
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
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: normalizeUserRole(payload.role) };
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

