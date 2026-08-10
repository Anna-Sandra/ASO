import { getApiBase } from "services/api";

export const GHANA_LAT_MIN = 4.5;
export const GHANA_LAT_MAX = 11.5;
export const GHANA_LNG_MIN = -3.5;
export const GHANA_LNG_MAX = 1.5;

export function isCoordinateInGhana(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return la >= GHANA_LAT_MIN && la <= GHANA_LAT_MAX && ln >= GHANA_LNG_MIN && ln <= GHANA_LNG_MAX;
}

export function formatGhanaCoords(lat, lng) {
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

export function googleMapsUrl(lat, lng, label) {
  const q =
    label && String(label).trim()
      ? String(label).trim()
      : `${lat},${lng}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}`;
}

export function googleMapsDirUrl(lat, lng, label) {
  const dest =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? `${lat},${lng}`
      : String(label || "").trim();
  if (!dest) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** OpenStreetMap embed for a pinned place (no API key). */
export function osmEmbedUrl(lat, lng, delta = 0.012) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return "";
  const left = ln - delta;
  const right = ln + delta;
  const bottom = la - delta;
  const top = la + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    `${left},${bottom},${right},${top}`
  )}&layer=mapnik&marker=${encodeURIComponent(`${la},${ln}`)}`;
}

function pickAddressParts(address) {
  if (!address || typeof address !== "object") return [];
  const order = [
    "amenity",
    "building",
    "road",
    "pedestrian",
    "neighbourhood",
    "suburb",
    "quarter",
    "village",
    "town",
    "city_district",
    "city",
    "municipality",
    "county",
    "state_district",
    "state"
  ];
  const seen = new Set();
  const parts = [];
  for (const key of order) {
    const v = address[key];
    if (typeof v !== "string" || !v.trim()) continue;
    const t = v.trim();
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(t);
  }
  return parts;
}

export function formatReverseGeocodeLabel(data) {
  if (!data || typeof data !== "object") return "";
  const parts = pickAddressParts(data.address);
  if (parts.length) {
    return parts.slice(0, 4).join(", ");
  }
  const name = typeof data.display_name === "string" ? data.display_name : "";
  if (!name) return "";
  return name
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
}

function formatBigDataCloudLabel(d) {
  if (!d || typeof d !== "object") return "";
  const parts = [
    d.localityInfo?.informative?.[0]?.name,
    d.locality,
    d.city,
    d.principalSubdivision,
    d.countryName === "Ghana" ? null : d.countryName
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.slice(0, 4).join(", ");
}

async function reverseViaPlatformApi(lat, lng) {
  const base = getApiBase();
  if (!base) return "";
  const url = `${base}/api/platform/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) return "";
  const d = await r.json().catch(() => null);
  return typeof d?.label === "string" ? d.label.trim() : "";
}

async function reverseViaBigDataCloud(lat, lng) {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
  const r = await fetch(url);
  if (!r.ok) return "";
  const d = await r.json().catch(() => null);
  return formatBigDataCloudLabel(d);
}

async function reverseViaNominatim(lat, lng) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}&format=json&addressdetails=1&zoom=18`;
  const r = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SHOPIQGH/1.0 (location lookup)"
    }
  });
  if (!r.ok) return "";
  const d = await r.json().catch(() => null);
  return formatReverseGeocodeLabel(d);
}

/**
 * Reverse geocode lat/lng → human-readable place name.
 * Prefers backend proxy (no CORS), then BigDataCloud (browser-friendly), then Nominatim.
 */
export async function reverseGeocodeGhana(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return "";

  const attempts = [reverseViaPlatformApi, reverseViaBigDataCloud, reverseViaNominatim];
  for (const fn of attempts) {
    try {
      const label = await fn(la, ln);
      if (label) return label;
    } catch {
      /* try next */
    }
  }
  return "";
}
