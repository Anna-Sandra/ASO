import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env, isSuperUserAdminEmail } from "../../config/env";

export type AccessTokenPayload = {
  sub: string;
  role: "buyer" | "seller" | "admin";
  /** short key: admin only — “super” can manage other admins */
  al?: "super" | "normal";
};

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.JWT_ACCESS_TTL_MINUTES}m`
  });
}

/** DB-backed users: admin tokens get `al` (super can grant admin to other accounts). */
export function buildAccessTokenPayloadForDbUser(
  sub: string,
  role: "buyer" | "seller" | "admin",
  email: string | null | undefined
): AccessTokenPayload {
  if (role !== "admin") {
    return { sub, role };
  }
  const al: "super" | "normal" = isSuperUserAdminEmail(email) ? "super" : "normal";
  return { sub, role, al };
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/** Resolves `al` in JWT; admin tokens without `al` are treated as non-super (normal). */
export function effectiveTokenAdminLevel(
  p: { role: string; al?: "super" | "normal" }
): "super" | "normal" | undefined {
  if (p.role !== "admin") return undefined;
  if (p.al === "super" || p.al === "normal") return p.al;
  return "normal";
}

/** Stateless refresh for env-configured platform admin when MongoDB has no refresh-token row. */
export function signBootstrapRefreshToken() {
  return jwt.sign({ typ: "bootstrap_refresh", v: 1 }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`
  });
}

export function tryVerifyBootstrapRefreshToken(token: string): boolean {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { typ?: unknown; v?: unknown };
    return payload.typ === "bootstrap_refresh" && payload.v === 1;
  } catch {
    return false;
  }
}

export function createOpaqueToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

