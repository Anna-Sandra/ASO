import { guestOrderSecretStorageKey, storageGet, storageSet } from "utils/storage";

const LEGACY_KEY_PREFIX = "guestOrderSecret:";

function readLegacySessionSecret(orderId) {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(`${LEGACY_KEY_PREFIX}${orderId || ""}`) || "";
  } catch {
    return "";
  }
}

/** Guest order access secret — persisted in localStorage (migrates from sessionStorage on read). */
export function getGuestOrderSecret(orderId) {
  const id = String(orderId || "").trim();
  if (!id) return "";
  const key = guestOrderSecretStorageKey(id);
  const current = storageGet(key);
  if (current) return current;
  const legacy = readLegacySessionSecret(id);
  if (legacy) {
    storageSet(key, legacy);
    try {
      sessionStorage.removeItem(`${LEGACY_KEY_PREFIX}${id}`);
    } catch {
      /* ignore */
    }
    return legacy;
  }
  return "";
}

export function setGuestOrderSecret(orderId, secret) {
  const id = String(orderId || "").trim();
  if (!id) return;
  storageSet(guestOrderSecretStorageKey(id), String(secret || "").trim());
}
