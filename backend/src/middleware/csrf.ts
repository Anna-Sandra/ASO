import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import { env } from "../config/env";

const CSRF_COOKIE = "csrfToken";

function csrfCookieOptions() {
  const crossSite = env.COOKIE_SECURE;
  return {
    httpOnly: true,
    sameSite: crossSite ? ("none" as const) : ("lax" as const),
    secure: crossSite,
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/api/auth"
  };
}

export function issueCsrfToken(res: Response): string {
  const token = crypto.randomBytes(24).toString("hex");
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  return token;
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  const cookieToken = String(req.cookies?.[CSRF_COOKIE] || "");
  const headerToken = String(req.headers["x-csrf-token"] || "").trim();
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new HttpError(403, "Session verification failed. Refresh and try again.", "CSRF_CHECK_FAILED"));
  }
  next();
}

