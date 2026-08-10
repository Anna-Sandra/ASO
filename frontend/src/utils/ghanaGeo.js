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

/**
 * Build a readable Ghana place label from Nominatim reverse result.
 * Prefers street / suburb / city over a full verbose display_name.
 */
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

/**
 * Reverse geocode lat/lng → human-readable place name (OpenStreetMap Nominatim).
 * Returns "" on failure so callers can fall back to coords or a manual label.
 */
export async function reverseGeocodeGhana(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return "";
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(la)}` +
      `&lon=${encodeURIComponent(ln)}&format=json&addressdetails=1&zoom=18`;
    const r = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SHOPIQGH/1.0 (location lookup; contact support@shopiqgh.com)"
      }
    });
    if (!r.ok) return "";
    const d = await r.json().catch(() => null);
    return formatReverseGeocodeLabel(d);
  } catch {
    return "";
  }
}
