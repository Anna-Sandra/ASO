import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { clientIpFromRequest, countryCodeFromHeaders, isRequestFromGhana } from "../utils/ghanaGeo";

const SKIP_PATH_PREFIXES = [
  "/health",
  "/api/platform/access-check",
  "/api/platform/config",
  "/api/admin",
  "/api/payments/stripe/webhook",
  "/api/payments/paystack/webhook",
  "/api/paystack/webhook",
  "/uploads/"
];

function shouldSkipGhanaGate(path: string): boolean {
  if (!path.startsWith("/api")) return true;
  return SKIP_PATH_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/**
 * Blocks API use outside Ghana when `GHANA_ONLY_ENABLED` is on.
 * Webhooks and health checks are always allowed.
 */
export async function requireGhanaAccess(req: Request, res: Response, next: NextFunction) {
  if (!env.GHANA_ONLY_ENABLED) return next();
  if (shouldSkipGhanaGate(req.path)) return next();

  const allowed = await isRequestFromGhana(req);
  if (allowed) return next();

  const ip = clientIpFromRequest(req);
  const country = countryCodeFromHeaders(req) || "unknown";
  res.status(403).json({
    error: "region_restricted",
    message: "SHOPIQGH is only available in Ghana. If you are in Ghana, try again on mobile data or contact support.",
    country,
    ipHint: ip ? `${ip.slice(0, Math.min(8, ip.length))}…` : ""
  });
}
