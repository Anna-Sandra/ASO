import type { Request } from "express";
import { env } from "../config/env";

const LOCAL_UPLOAD_HOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/|$)/i;

export function getConfiguredPublicApiOriginTrimmed(): string {
  return env.API_PUBLIC_ORIGIN.trim().replace(/\/$/, "");
}

/** Prefer env on platforms like Render so URLs are HTTPS even behind a proxy without relying on inferred protocol. */
export function tryResolvePublicUploadBaseUrl(req: Pick<Request, "protocol" | "get">): string | null {
  const fromEnv = getConfiguredPublicApiOriginTrimmed();
  if (fromEnv) return fromEnv;
  const host = req.get("host");
  if (!host) return null;
  return `${req.protocol}://${host}`;
}

/**
 * Stored documents may contain `http://localhost:4000/uploads/…` from local dev uploads.
 * When `API_PUBLIC_ORIGIN` is set (production Render URL), rewrite those origins for JSON responses.
 * Also turns relative `/uploads/…` into absolute URLs under `API_PUBLIC_ORIGIN`.
 */
export function rewriteStoredMediaUrl(raw: string | null | undefined): string {
  if (raw == null) return "";
  const url = String(raw).trim();
  if (!url) return "";
  const target = getConfiguredPublicApiOriginTrimmed();
  if (target && LOCAL_UPLOAD_HOST_RE.test(url)) return url.replace(LOCAL_UPLOAD_HOST_RE, target);
  if (target && url.startsWith("/uploads")) return `${target}${url.startsWith("/") ? url : `/${url}`}`;
  return url;
}

export function rewriteStoredMediaNullable(raw: string | null | undefined): string | null | undefined {
  if (raw === null || raw === undefined) return raw;
  return rewriteStoredMediaUrl(raw);
}
