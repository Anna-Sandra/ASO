const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "brewmart_access_token";
let refreshPromise = null;

if (process.env.NODE_ENV === "development" && typeof window !== "undefined" && !API_BASE) {
  console.warn(
    "[Campus Mart] REACT_APP_API_URL is empty. Set it in frontend/.env to your API (e.g. http://localhost:4000) and restart npm start."
  );
}

export function getApiBase() {
  return API_BASE;
}

function emitTokenUpdate(token) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("auth:token", { detail: token || null }));
  } catch {
    /* ignore browser quirks */
  }
}

async function parseResponse(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return data;
}

function shouldSkip401Refresh(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p === "/api/auth/refresh" || p === "/api/auth/login" || p === "/api/auth/register" || p === "/api/auth/logout";
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const url = `${API_BASE}/api/auth/refresh`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include"
    });
    const data = await parseResponse(res);
    if (!res.ok || !data?.accessToken) {
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
      emitTokenUpdate(null);
      return null;
    }
    try {
      sessionStorage.setItem(TOKEN_KEY, data.accessToken);
    } catch {
      /* ignore */
    }
    emitTokenUpdate(data.accessToken);
    return data.accessToken;
  })()
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/**
 * @param {string} path
 * @param {RequestInit & { json?: unknown }} [opts]
 */
/**
 * Permanently delete the authenticated user (buyer or seller). Tries POST paths then DELETE for older APIs.
 * @param {string} accessToken
 * @param {{ password: string, confirm: string }} payload
 */
export async function deleteAuthenticatedAccount(accessToken, payload) {
  const postPaths = ["/api/auth/delete-account", "/api/auth/account/delete"];
  for (const path of postPaths) {
    try {
      return await apiFetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: payload
      });
    } catch (e) {
      if (e.status === 404) continue;
      throw e;
    }
  }
  return apiFetch("/api/auth/account", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    json: payload
  });
}

export async function apiFetch(path, opts = {}) {
  const retried = Boolean(opts._retriedAfterRefresh);
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(opts.headers || {});
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const init = {
    ...opts,
    headers,
    credentials: opts.credentials ?? "include",
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
    // Avoid stale dashboard/review lists (browsers may cache GET otherwise).
    cache: opts.cache ?? "no-store"
  };
  delete init.json;
  delete init._retriedAfterRefresh;
  const res = await fetch(url, init);
  const data = await parseResponse(res);
  if (
    res.ok &&
    data &&
    typeof data === "object" &&
    Object.prototype.hasOwnProperty.call(data, "raw") &&
    typeof data.raw === "string" &&
    /^\s*</.test(data.raw)
  ) {
    const err = new Error(
      API_BASE
        ? "Server returned HTML instead of JSON. Is the API running and is REACT_APP_API_URL correct?"
        : "REACT_APP_API_URL is not set. Add it in frontend/.env (e.g. http://localhost:4000) and restart npm start."
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  if (res.status === 401 && !retried && !shouldSkip401Refresh(path)) {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      const nextHeaders = new Headers(opts.headers || {});
      nextHeaders.set("Authorization", `Bearer ${nextToken}`);
      return apiFetch(path, { ...opts, headers: nextHeaders, _retriedAfterRefresh: true });
    }
  }
  if (!res.ok) {
    const msg =
      data && data.error && data.error.message
        ? data.error.message
        : `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Upload product image files (multipart). Requires seller auth.
 * @param {File[]} files
 * @param {string} accessToken
 */
export async function apiUploadProductImages(files, accessToken) {
  if (!API_BASE) {
    throw new Error("REACT_APP_API_URL is not set. Add it in frontend/.env (e.g. http://localhost:4000).");
  }
  const fd = new FormData();
  for (const f of files) {
    fd.append("images", f);
  }
  const url = `${API_BASE}/api/uploads/product-images`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
    credentials: "include"
  });
  const data = await parseResponse(res);
  if (!res.ok) {
    const msg =
      data && data.error && data.error.message
        ? data.error.message
        : `Upload failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
