import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { HttpError } from "../utils/httpError";
import { ADMIN_GATE_COOKIE, verifyAdminGateCookie } from "./adminGate";

/**
 * Production requires `ADMIN_ACCESS_SECRET` (enforced at startup).
 * Accepts matching `X-Admin-Secret`, httpOnly gate cookie, or `X-Admin-Gate` from admin sign-in.
 */
export function requireAdminEnvSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = (env.ADMIN_ACCESS_SECRET || "").trim();
  if (!secret) {
    if (env.NODE_ENV === "production") {
      return next(new HttpError(503, "Admin API is not configured."));
    }
    return next();
  }
  const h = (req.headers["x-admin-secret"] || req.headers["x-admin-key"]) as string | undefined;
  if (h === secret) return next();
  const cookie = req.cookies?.[ADMIN_GATE_COOKIE] as string | undefined;
  if (verifyAdminGateCookie(cookie)) return next();
  const gateHeader = (req.headers["x-admin-gate"] as string | undefined)?.trim();
  if (gateHeader && verifyAdminGateCookie(gateHeader)) return next();
  return next(
    new HttpError(
      403,
      "Admin session could not be verified. Sign out, sign in again as admin, then try once more."
    )
  );
}
