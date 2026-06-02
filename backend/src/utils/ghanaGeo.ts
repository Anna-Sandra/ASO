import type { Request } from "express";

/** Inclusive bounding box for Ghana (generous for GPS edge cases). */
export const GHANA_LAT_MIN = 4.5;
export const GHANA_LAT_MAX = 11.5;
export const GHANA_LNG_MIN = -3.5;
export const GHANA_LNG_MAX = 1.5;

export function isCoordinateInGhana(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= GHANA_LAT_MIN && lat <= GHANA_LAT_MAX && lng >= GHANA_LNG_MIN && lng <= GHANA_LNG_MAX;
}

export function formatGhanaCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function clientIpFromRequest(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const xf = req.headers["x-forwarded-for"];
  const fromXf =
    typeof xf === "string" ? xf.split(",")[0]?.trim() : Array.isArray(xf) ? String(xf[0] || "").trim() : "";
  if (fromXf) return fromXf;
  const rip = req.ip || req.socket?.remoteAddress || "";
  return String(rip).replace(/^::ffff:/, "");
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const v = (ip || "").trim();
  if (!v || v === "::1" || v === "127.0.0.1") return true;
  if (v.startsWith("127.") || v.startsWith("10.") || v.startsWith("192.168.")) return true;
  if (v.startsWith("172.")) {
    const p = v.split(".")[1];
    const n = Number(p);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

/** CDN / edge country headers when present. */
export function countryCodeFromHeaders(req: Request): string | null {
  const keys = ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country"] as const;
  for (const k of keys) {
    const raw = req.headers[k];
    const v = (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "").trim().toUpperCase();
    if (v && v.length === 2 && v !== "XX" && v !== "T1") return v;
  }
  return null;
}

let lastIpLookupAt = 0;
const ipLookupCache = new Map<string, { country: string | null; at: number }>();
const IP_LOOKUP_CACHE_MS = 5 * 60 * 1000;

/** Best-effort country for an IP (GH when local/dev). */
export async function resolveCountryCodeForIp(ip: string): Promise<string | null> {
  if (isPrivateOrLocalIp(ip)) return "GH";

  const cached = ipLookupCache.get(ip);
  if (cached && Date.now() - cached.at < IP_LOOKUP_CACHE_MS) return cached.country;

  const now = Date.now();
  if (now - lastIpLookupAt < 120) {
    await new Promise((r) => setTimeout(r, 120));
  }
  lastIpLookupAt = Date.now();

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,message`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const data = (await r.json().catch(() => ({}))) as {
      status?: string;
      countryCode?: string;
    };
    const country =
      data.status === "success" && typeof data.countryCode === "string"
        ? data.countryCode.trim().toUpperCase()
        : null;
    ipLookupCache.set(ip, { country, at: Date.now() });
    return country;
  } catch {
    ipLookupCache.set(ip, { country: null, at: Date.now() });
    return null;
  }
}

export async function isRequestFromGhana(req: Request): Promise<boolean> {
  const fromHeader = countryCodeFromHeaders(req);
  if (fromHeader) return fromHeader === "GH";
  const ip = clientIpFromRequest(req);
  const country = await resolveCountryCodeForIp(ip);
  if (country === "GH") return true;
  if (country && country !== "GH") return false;
  /** Unknown geo — allow API so the app can still load; storefront gate handles UX. */
  return true;
}
