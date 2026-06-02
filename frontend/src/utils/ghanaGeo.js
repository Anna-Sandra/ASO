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

export function googleMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** Lightweight reverse geocode for application forms (optional label). */
export async function reverseGeocodeGhana(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json`,
      { headers: { Accept: "application/json", "User-Agent": "SHOPIQGH/1.0 (vendor application)" } }
    );
    const d = await r.json().catch(() => ({}));
    const name = typeof d.display_name === "string" ? d.display_name : "";
    if (!name) return "";
    return name.split(",").slice(0, 4).join(", ").trim();
  } catch {
    return "";
  }
}
