import crypto from "node:crypto";
import type { Response } from "express";
import { env } from "../config/env";

export const ADMIN_GATE_COOKIE = "adminAccessGate";

const GATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function adminGateCookieOptions() {
  const crossSite = env.COOKIE_SECURE;
  return {
    httpOnly: true,
    sameSite: crossSite ? ("none" as const) : ("lax" as const),
    secure: crossSite,
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/"
  };
}

function gateSigningKey(): string | null {
  const secret = (env.ADMIN_ACCESS_SECRET || "").trim();
  return secret.length >= 24 ? secret : null;
}

function signAdminGate(userId: string): string | null {
  const key = gateSigningKey();
  if (!key || !userId) return null;
  const exp = Date.now() + GATE_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac("sha256", key).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminGateCookie(value: string | undefined): boolean {
  const key = gateSigningKey();
  if (!key || !value) return false;
  const parts = String(value).split(".");
  if (parts.length !== 3) return false;
  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = crypto.createHmac("sha256", key).update(`${userId}.${expStr}`).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** httpOnly cookie so the admin SPA never needs a build-time admin secret. */
export function setAdminAccessGateCookie(res: Response, userId: string) {
  const token = signAdminGate(userId);
  if (!token) return;
  res.cookie(ADMIN_GATE_COOKIE, token, adminGateCookieOptions());
}

export function clearAdminAccessGateCookie(res: Response) {
  res.clearCookie(ADMIN_GATE_COOKIE, adminGateCookieOptions());
}
