import { getOrCreateSaveSessionId } from "utils/saveSession";
import { storageGet, storageRemove, storageSet, StorageKeys } from "utils/storage";
import { apiErrorMessage as buildApiErrorMessage } from "utils/userFacingError";

/**
 * CRA replaces `process.env.REACT_APP_*` at **build** time — not at runtime in the browser.
 * Set `REACT_APP_API_URL` in Vercel (or `.env`), then redeploy; there is no localhost fallback here.
 */
const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const ADMIN_API_KEY = (process.env.REACT_APP_ADMIN_API_KEY || "").trim();
let refreshPromise = null;

/**
 * When `REACT_APP_ADMIN_API_KEY` matches the API `ADMIN_ACCESS_SECRET`, admin routes can be called
 * (defense in depth; role is still enforced on the server).
 * @param {string} path
 * @param {Headers} headers
 */
function mergeAdminHeaders(path, headers) {
  if (!ADMIN_API_KEY) return;
  if (!path.includes("/api/admin")) return;
  if (!headers.has("X-Admin-Secret")) {
    headers.set("X-Admin-Secret", ADMIN_API_KEY);
  }
}

if (process.env.NODE_ENV === "development" && typeof window !== "undefined" && !API_BASE) {
  console.warn(
    "[SHOPIQGH] REACT_APP_API_URL is empty — `/api/*` will use the dev-server proxy (see setupProxy.js → :4000). " +
      "Set REACT_APP_API_URL only if you want the browser to call the API host directly."
  );
}

export function getApiBase() {
  return API_BASE;
}

/** Unauthenticated snapshot for login/register/vendor apply (maintenance, sign-up toggles, branding). */
export async function fetchPublicPlatformConfig() {
  const base = getApiBase();
  if (!base) return null;
  try {
    const r = await fetch(`${base}/api/platform/config`, { credentials: "omit" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
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
      storageRemove(StorageKeys.ACCESS_TOKEN);
      emitTokenUpdate(null);
      return null;
    }
    storageSet(StorageKeys.ACCESS_TOKEN, data.accessToken);
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
  mergeAdminHeaders(path, headers);
  const authHdr = String(headers.get("Authorization") || "").trim();
  if (!authHdr.startsWith("Bearer ")) {
    const sid = getOrCreateSaveSessionId();
    if (sid && !headers.has("X-Save-Session")) {
      headers.set("X-Save-Session", sid);
    }
  }
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
      mergeAdminHeaders(path, nextHeaders);
      return apiFetch(path, { ...opts, headers: nextHeaders, _retriedAfterRefresh: true });
    }
  }
  if (!res.ok) {
    const rawMsg =
      data && data.error && data.error.message
        ? data.error.message
        : `Request failed (${res.status})`;
    const err = new Error(
      buildApiErrorMessage(
        { message: rawMsg, status: res.status, data },
        "Something went wrong. Refresh the page and try again."
      )
    );
    err.status = res.status;
    err.data = data;
    if (data && data.error && data.error.code) err.code = data.error.code;
    throw err;
  }
  return data;
}

export { apiErrorMessage, sanitizeErrorMessage, userMessage, displayError } from "utils/userFacingError";

function throwUploadError(res, data, fallback = "We could not upload that file. Choose a smaller JPEG or PNG (under 5 MB) and try again.") {
  const rawMsg =
    data && data.error && data.error.message ? data.error.message : `Upload failed (${res.status})`;
  const err = new Error(buildApiErrorMessage({ message: rawMsg, status: res.status, data }, fallback));
  err.status = res.status;
  err.data = data;
  throw err;
}

/**
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
  if (!res.ok) throwUploadError(res, data, "We could not upload your product images. Use JPEG, PNG, or WebP under 5 MB each.");
  return data;
}

/**
 * Upload optional book/companion PDF (field `file`, application/pdf only). Requires seller/admin auth.
 * @param {File} file
 * @param {string} accessToken
 * @returns {Promise<{ url: string }>}
 */
export async function apiUploadBookPdf(file, accessToken) {
  if (!API_BASE) {
    throw new Error("REACT_APP_API_URL is not set. Add it in frontend/.env (e.g. http://localhost:4000).");
  }
  const fd = new FormData();
  fd.append("file", file);
  const url = `${API_BASE}/api/uploads/book-pdf`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
    credentials: "include"
  });
  const data = await parseResponse(res);
  if (!res.ok) throwUploadError(res, data, "We could not upload the PDF. Use a file under 15 MB.");
  return data;
}

/**
 * Upload profile/avatar (multipart field `image`). Any authenticated role.
 * @param {File} file
 * @param {string} accessToken
 */
export async function apiUploadProfileImage(file, accessToken) {
  if (!API_BASE) {
    throw new Error("REACT_APP_API_URL is not set. Add it in frontend/.env (e.g. http://localhost:4000).");
  }
  const fd = new FormData();
  fd.append("image", file);
  const url = `${API_BASE}/api/uploads/profile-image`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
    credentials: "include"
  });
  const data = await parseResponse(res);
  if (!res.ok) throwUploadError(res, data, "We could not upload your profile photo. Use a JPEG or PNG under 5 MB.");
  return data;
}

/**
 * Upload delivery proof photo (multipart field `image`). Requires rider/admin auth.
 * @param {File} file
 * @param {string} accessToken
 * @returns {Promise<{ url: string }>}
 */
export async function apiUploadDeliveryProof(file, accessToken) {
  if (!API_BASE) {
    throw new Error("REACT_APP_API_URL is not set. Add it in frontend/.env (e.g. http://localhost:4000).");
  }
  const fd = new FormData();
  fd.append("image", file);
  const url = `${API_BASE}/api/uploads/delivery-proof`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
    credentials: "include"
  });
  const data = await parseResponse(res);
  if (!res.ok) throwUploadError(res, data, "We could not upload the delivery photo. Try a clearer photo under 5 MB.");
  return data;
}

/** Load storefront JSON; pass accessToken when owner/admin so unlinked listings can sync server-side. */
export async function fetchBusinessStorefront(slug, { accessToken } = {}) {
  const key = encodeURIComponent(String(slug || "").trim());
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  return apiFetch(`/api/businesses/${key}/storefront`, { headers });
}

/** Attach unlinked seller listings to this store (multi-store sellers). */
export async function linkListingsToStore(slug, accessToken) {
  const key = encodeURIComponent(String(slug || "").trim());
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  return apiFetch(`/api/businesses/${key}/link-listings`, { method: "POST", headers });
}
