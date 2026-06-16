import { isAccessTokenExpired } from "utils/authJwt";
import { storageGet, storageRemove, storageSet, StorageKeys } from "utils/storage";

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const REFRESH_LOCK_NAME = "shopiqgh-auth-refresh";
const REFRESH_LOCK_STALE_MS = 25_000;
/** Skip server refresh when access JWT still has more than this many seconds left. */
const ACCESS_REFRESH_MIN_REMAINING_SEC = 120;
/** Minimum gap between successful refresh rotations (avoids multi-tab / interval storms). */
const MIN_REFRESH_INTERVAL_MS = 90_000;

let refreshPromise = null;
let lastSuccessfulRefreshAt = 0;

function emitTokenUpdate(token) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("auth:token", { detail: token || null }));
  } catch {
    /* ignore */
  }
}

async function parseResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function ensureCsrfToken({ force = false } = {}) {
  if (!force) {
    const existing = storageGet(StorageKeys.CSRF_TOKEN);
    if (existing) return existing;
  } else {
    storageRemove(StorageKeys.CSRF_TOKEN);
  }
  const res = await fetch(`${API_BASE}/api/auth/csrf`, {
    method: "GET",
    credentials: "include"
  });
  const data = await parseResponse(res);
  if (!res.ok || !data?.csrfToken) {
    throw new Error("Could not initialize session security token.");
  }
  storageSet(StorageKeys.CSRF_TOKEN, data.csrfToken);
  return data.csrfToken;
}

function persistTokens(data) {
  if (!data?.accessToken) return false;
  storageSet(StorageKeys.ACCESS_TOKEN, data.accessToken);
  if (data.refreshToken) storageSet(StorageKeys.REFRESH_TOKEN, data.refreshToken);
  if (data.adminGateToken) storageSet(StorageKeys.ADMIN_GATE_TOKEN, data.adminGateToken);
  emitTokenUpdate(data.accessToken);
  return true;
}

function readValidAccessToken() {
  const t = storageGet(StorageKeys.ACCESS_TOKEN);
  if (t && !isAccessTokenExpired(t)) return t;
  return null;
}

async function postRefresh(body, csrfToken) {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(body ?? {}),
    credentials: "include"
  });
  const data = await parseResponse(res);
  return { res, data };
}

/**
 * Try cookie-only refresh, then localStorage refresh token (server also tries both).
 * @returns {Promise<string|null>} new access token or null
 */
async function refreshTokensOnce() {
  const beforeAccess = storageGet(StorageKeys.ACCESS_TOKEN);
  const storedRefresh = storageGet(StorageKeys.REFRESH_TOKEN);

  let csrfToken;
  try {
    csrfToken = await ensureCsrfToken();
  } catch {
    return readValidAccessToken();
  }

  const attempts = [{}, storedRefresh ? { refreshToken: storedRefresh } : null].filter(Boolean);

  for (let i = 0; i < attempts.length; i += 1) {
    let result;
    try {
      result = await postRefresh(attempts[i], csrfToken);
    } catch {
      continue;
    }

    const { res, data } = result;

    if (res.status === 429) {
      const fallback = readValidAccessToken() || (beforeAccess && !isAccessTokenExpired(beforeAccess) ? beforeAccess : null);
      if (fallback) return fallback;
    }

    if (res.ok && data?.accessToken) {
      persistTokens(data);
      lastSuccessfulRefreshAt = Date.now();
      return data.accessToken;
    }

    if (res.status === 403 && data?.error?.code === "CSRF_CHECK_FAILED" && i === 0) {
      try {
        csrfToken = await ensureCsrfToken({ force: true });
        result = await postRefresh(attempts[i], csrfToken);
        if (result.res.ok && result.data?.accessToken) {
          persistTokens(result.data);
          lastSuccessfulRefreshAt = Date.now();
          return result.data.accessToken;
        }
      } catch {
        /* retry next attempt */
      }
    }
  }

  const afterAccess = storageGet(StorageKeys.ACCESS_TOKEN);
  if (afterAccess && afterAccess !== beforeAccess && !isAccessTokenExpired(afterAccess)) {
    emitTokenUpdate(afterAccess);
    return afterAccess;
  }

  const valid = readValidAccessToken();
  if (valid) return valid;

  if (beforeAccess && !isAccessTokenExpired(beforeAccess)) {
    return beforeAccess;
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Cross-tab mutex so two tabs do not rotate the same refresh token concurrently. */
async function withRefreshLock(fn) {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK_NAME, fn);
  }

  const lockKey = `${StorageKeys.ACCESS_TOKEN}_refresh_lock`;
  const started = Date.now();
  while (storageGet(lockKey)) {
    if (Date.now() - started > REFRESH_LOCK_STALE_MS) {
      storageRemove(lockKey);
      break;
    }
    await sleep(80);
  }
  storageSet(lockKey, String(Date.now()));
  try {
    return await fn();
  } finally {
    storageRemove(lockKey);
  }
}

/**
 * Refresh access token (deduped + cross-tab lock). Never clears storage unless session is truly dead.
 * @returns {Promise<string|null>}
 */
export async function refreshSessionTokens() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = withRefreshLock(async () => {
    const valid = readValidAccessToken();
    if (valid && !isAccessTokenExpired(valid, ACCESS_REFRESH_MIN_REMAINING_SEC)) {
      return valid;
    }
    const storedRefresh = storageGet(StorageKeys.REFRESH_TOKEN);
    if (!valid && !storedRefresh) {
      return null;
    }
    if (
      valid &&
      !isAccessTokenExpired(valid, 30) &&
      Date.now() - lastSuccessfulRefreshAt < MIN_REFRESH_INTERVAL_MS
    ) {
      return valid;
    }
    const token = await refreshTokensOnce();
    if (token) return token;

    const stillValid = readValidAccessToken();
    if (stillValid) return stillValid;

    if (valid && !isAccessTokenExpired(valid, 15)) {
      return valid;
    }

    storageRemove(StorageKeys.ACCESS_TOKEN);
    storageRemove(StorageKeys.REFRESH_TOKEN);
    storageRemove(StorageKeys.ADMIN_GATE_TOKEN);
    emitTokenUpdate(null);
    return null;
  }).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/**
 * Boot-time session restore: keep user signed in when refresh is flaky but tokens remain valid.
 * @returns {Promise<{ accessToken: string|null, refreshToken: string|null }>}
 */
export async function restoreSessionFromStorage() {
  let accessToken = storageGet(StorageKeys.ACCESS_TOKEN);
  const refreshToken = storageGet(StorageKeys.REFRESH_TOKEN);

  if (accessToken && !isAccessTokenExpired(accessToken)) {
    return { accessToken, refreshToken };
  }

  const renewed = await refreshSessionTokens();
  if (renewed) {
    return {
      accessToken: renewed,
      refreshToken: storageGet(StorageKeys.REFRESH_TOKEN)
    };
  }

  accessToken = storageGet(StorageKeys.ACCESS_TOKEN);
  if (accessToken && !isAccessTokenExpired(accessToken)) {
    return { accessToken, refreshToken: storageGet(StorageKeys.REFRESH_TOKEN) };
  }

  return { accessToken: null, refreshToken: null };
}

export function readStoredAccessToken() {
  return storageGet(StorageKeys.ACCESS_TOKEN);
}

export function isStoredAccessTokenValid(skewSec = 30) {
  const t = storageGet(StorageKeys.ACCESS_TOKEN);
  return Boolean(t && !isAccessTokenExpired(t, skewSec));
}
