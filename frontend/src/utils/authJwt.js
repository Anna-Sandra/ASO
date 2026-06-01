export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** True when access JWT is missing `exp` or past expiry (optional skew seconds). */
export function isAccessTokenExpired(token, skewSec = 30) {
  const p = decodeJwtPayload(token);
  if (!p?.exp) return false;
  return Date.now() >= (Number(p.exp) - skewSec) * 1000;
}
