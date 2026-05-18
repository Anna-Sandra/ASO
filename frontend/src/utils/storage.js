/**
 * Browser persistence — localStorage only (SSR-safe, try/catch wrapped).
 * Import from here instead of calling localStorage/sessionStorage directly.
 */

export const StorageKeys = {
  ACCESS_TOKEN: "SHOPIQGH_access_token",
  CART: "SHOPIQGH_cart_v1",
  THEME: "SHOPIQGH-theme",
  SAVE_SESSION: "SHOPIQGH_save_session"
};

const LEGACY_KEYS = {
  [StorageKeys.ACCESS_TOKEN]: ["campusmart_access_token"],
  [StorageKeys.CART]: ["campusmart_cart_v1"],
  [StorageKeys.THEME]: ["campus-mart-theme"],
  [StorageKeys.SAVE_SESSION]: ["campusmart_save_session"]
};

function hasWindow() {
  return typeof window !== "undefined";
}

/** One-time: move auth token from sessionStorage → localStorage for existing sessions. */
export function migrateLegacySessionStorage() {
  if (!hasWindow()) return;
  try {
    const legacy = sessionStorage.getItem(StorageKeys.ACCESS_TOKEN);
    if (legacy && !localStorage.getItem(StorageKeys.ACCESS_TOKEN)) {
      localStorage.setItem(StorageKeys.ACCESS_TOKEN, legacy);
    }
    sessionStorage.removeItem(StorageKeys.ACCESS_TOKEN);
    sessionStorage.removeItem("campusmart_access_token");
  } catch {
    /* ignore */
  }
}

/** Copy values from pre-rebrand localStorage keys so users stay signed in. */
export function migrateLegacyLocalStorageKeys() {
  if (!hasWindow()) return;
  try {
    for (const [current, olds] of Object.entries(LEGACY_KEYS)) {
      if (localStorage.getItem(current)) continue;
      for (const old of olds) {
        const v = localStorage.getItem(old);
        if (v != null && v !== "") {
          localStorage.setItem(current, v);
          break;
        }
      }
    }
  } catch {
    /* ignore */
  }
}

if (hasWindow()) {
  migrateLegacyLocalStorageKeys();
  migrateLegacySessionStorage();
}

export function storageGet(key) {
  if (!hasWindow()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key, value) {
  if (!hasWindow()) return;
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    /* quota / private mode */
  }
}

export function storageRemove(key) {
  storageSet(key, null);
}

export function storageGetJSON(key, fallback = null) {
  const raw = storageGet(key);
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function storageSetJSON(key, value) {
  try {
    storageSet(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
