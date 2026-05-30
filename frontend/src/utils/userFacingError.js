/**
 * Plain-English errors with clear next steps for shoppers, vendors, riders, and admins.
 */

const STATUS_FALLBACKS = {
  400: "We could not accept that request. Check the form for highlighted fields, fix them, and try again.",
  401: "You need to sign in first. Go to Sign in, enter your email and password, then try this again.",
  403: "Your account cannot do this here. Sign in with the right account (buyer, vendor, or rider), or ask support if you think this is a mistake.",
  404: "We could not find that item. It may have been removed. Go back to the shop or orders list and open it again from there.",
  409: "This was already done or conflicts with existing data. Refresh the page and check the latest status before trying again.",
  413: "That file is too large. Choose a smaller image (under 5 MB) or compress it, then upload again.",
  429: "Too many tries in a short time. Wait about a minute, then try again.",
  500: "Something went wrong on our side. Wait a moment, refresh the page, and try again. If it keeps failing, contact support.",
  502: "Our servers are busy or updating. Wait a minute and try again.",
  503: "SHOPIQGH is temporarily unavailable. Try again in a few minutes."
};

/** [regex, replacement] — backend phrases → what happened + what to do */
const KNOWN_ACTIONABLE = [
  [/delivery photo is required/i, "Add a clear photo of the delivery (package at the door or with the recipient), then tap Complete delivery again."],
  [/assign a rider before/i, "Ask the vendor to assign a courier first: on the order, open Assign rider and pick someone from the list."],
  [/only assigned rider/i, "Only the courier assigned to this order can update this step. Sign in as that rider, or ask the vendor to assign you."],
  [/follow the rider sequence/i, "Update delivery in order: tap Mark picked up, then On the way, then Mark delivered (with a photo)."],
  [/proof photo/i, "Take or upload a delivery photo, fill in any optional details, then submit."],
  [/dropoffLatitude|dropoffLongitude|delivery location/i, "At checkout, enter your delivery address and tap Use my location so the courier can find you on the map."],
  [/Use my location|GPS/i, "Tap Use my location on checkout and allow location access in your browser, or move to an open area and try again."],
  [/sign in|Unauthorized/i, "Sign in with your email and password, then try again."],
  [/verify your email|email verification/i, "Open your email inbox, find the SHOPIQGH code or link, and complete verification. Then sign in again."],
  [/paystack|payment/i, "Complete payment on the Paystack screen. If it failed, check your card or MoMo balance and try Pay now again."],
  [/cart is empty/i, "Add items to your cart from the shop, then return to checkout."],
  [/invalid transition|invalid state/i, "This order cannot move to that status yet. Refresh the page and use the next step shown (for example Processing before Delivered)."],
  [/order not paid|not paid yet/i, "Wait until payment is confirmed, or mark the order paid if the buyer paid you directly."],
  [/rider profile not found/i, "That person is not set up as a courier. Choose another rider from Available riders, or ask admin to add couriers."],
  [/product unavailable|not found/i, "That product may be sold out or removed. Go back to the shop and choose another item."],
  [/network|fetch failed|failed to fetch/i, "Check your internet connection, then refresh the page and try again."],
  [/REACT_APP_API_URL/i, "The app is not connected to the server. If you run the site locally, start the backend and set REACT_APP_API_URL, then rebuild."],
  [/maintenance/i, "The site is in maintenance. Try again later or contact support."],
  [/banned|suspended/i, "This account is restricted. Contact support if you need help."],
  [/too many/i, "Wait a minute before trying again."],
  [/upload/i, "Choose a smaller file (JPEG or PNG under 5 MB) and upload again."]
];

/** @param {string} raw */
function humanizeZodStyleMessage(raw) {
  const m = String(raw || "").trim();
  if (/Too small:\s*expected string to have >=\s*(\d+)/i.test(m)) {
    const n = Number(m.match(/>=\s*(\d+)/i)?.[1] || 0);
    if (n >= 15) return "Please write a bit more in that box (at least a short sentence), then submit again.";
    if (n >= 10) return "That field needs a little more text. Add a short description and try again.";
    if (n >= 5) return "Enter your full phone number (at least 8 digits), then try again.";
    return "Fill in that required field, then try again.";
  }
  if (/Too big:/i.test(m)) return "That text is too long. Shorten it and submit again.";
  if (/expected string,\s*received undefined/i.test(m)) {
    return "A required field was left empty. Fill in every required field, then submit again.";
  }
  if (/Invalid option:|Invalid enum/i.test(m)) return "Choose one of the options from the dropdown or list, then try again.";
  if (/must be provided together/i.test(m)) return "Enter both the address and your GPS location (tap Use my location at checkout).";
  if (/Invalid input/i.test(m)) return "Check your entries for typos, then try again.";
  return m;
}

/** @param {string} raw */
function looksTechnical(raw) {
  const m = String(raw || "").trim();
  if (!m) return false;
  if (/^(Validation error|Internal server error|Forbidden|Unauthorized|Error)$/i.test(m)) return true;
  if (/Request failed \(\d{3}\)/i.test(m)) return true;
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|MongoServer|MongoNetwork|ZodError|TypeError:/i.test(m)) return true;
  if (/^\s*at\s+.+\(.+:\d+:\d+\)/m.test(m)) return true;
  if (/HTTP\s*\d{3}/i.test(m)) return true;
  if (/Too small:|Too big:|expected string|Invalid option:/i.test(m)) return true;
  if (m.length > 280 && /\/|\\/.test(m) && /\bat\b/.test(m)) return true;
  return false;
}

/** @param {string} m */
function matchKnownActionable(m) {
  for (const [re, text] of KNOWN_ACTIONABLE) {
    if (re.test(m)) return text;
  }
  return "";
}

/** @param {string} m */
function alreadyHasGuidance(m) {
  return /\b(then try|try again|refresh|sign in|tap |add |choose |upload |wait |go to |open |contact support|check your|fill in|enter your|allow )\b/i.test(m);
}

/**
 * Sanitize any error string for display (alerts, toasts, inline notices).
 * @param {unknown} raw
 * @param {string} [fallback]
 * @returns {string}
 */
export function sanitizeErrorMessage(raw, fallback = "Something went wrong. Refresh the page and try again.") {
  let m = "";
  if (typeof raw === "string") m = raw.trim();
  else if (raw && typeof raw === "object" && typeof raw.message === "string") m = raw.message.trim();

  if (!m) return fallback;

  if (/^Request failed \(\d{3}\)$/i.test(m)) {
    const code = Number(m.match(/\d{3}/)?.[0]);
    return STATUS_FALLBACKS[code] || fallback;
  }

  const known = matchKnownActionable(m);
  if (known) return known;

  m = humanizeZodStyleMessage(m);

  if (looksTechnical(m)) {
    const codeMatch = String(raw).match(/\b(40[0-9]|50[0-3])\b/);
    const code = codeMatch ? Number(codeMatch[1]) : 0;
    if (code && STATUS_FALLBACKS[code]) return STATUS_FALLBACKS[code];
    if (/Validation error/i.test(m)) return "Check the form for missing or incorrect fields, fix them, and submit again.";
    if (/Forbidden/i.test(m)) return STATUS_FALLBACKS[403];
    if (/Unauthorized/i.test(m)) return STATUS_FALLBACKS[401];
    if (/Internal server error/i.test(m)) return STATUS_FALLBACKS[500];
    return fallback;
  }

  if (m === "Validation error") return "Check the form for missing or incorrect fields, fix them, and submit again.";
  if (/^Forbidden$/i.test(m)) return STATUS_FALLBACKS[403];
  if (/^Unauthorized$/i.test(m)) return STATUS_FALLBACKS[401];

  if (!alreadyHasGuidance(m) && m.length < 120) {
    return `${m} If it still does not work, refresh the page and try again.`;
  }

  return m;
}

/**
 * Prefer API error message from `apiFetch`, with status-aware fallbacks that explain what to do.
 * @param {unknown} ex
 * @param {string} [fallback]
 * @returns {string}
 */
export function apiErrorMessage(ex, fallback = "Something went wrong. Refresh the page and try again.") {
  const status = ex && typeof ex.status === "number" ? ex.status : 0;
  const fromApi =
    ex?.data?.error?.message && typeof ex.data.error.message === "string"
      ? ex.data.error.message.trim()
      : "";
  const fromErr = ex && typeof ex.message === "string" ? ex.message.trim() : "";
  const raw = fromApi || fromErr;

  const cleaned = sanitizeErrorMessage(raw, "");
  if (cleaned) return cleaned;

  if (status && STATUS_FALLBACKS[status]) return STATUS_FALLBACKS[status];
  return fallback;
}

/** Shorthand — same as apiErrorMessage. */
export const userMessage = apiErrorMessage;

/** @param {unknown} data */
export function messageFromApiJson(data) {
  if (!data || typeof data !== "object") return "";
  const nested = data.error && typeof data.error.message === "string" ? data.error.message.trim() : "";
  if (nested) return sanitizeErrorMessage(nested, "");
  const top = typeof data.message === "string" ? data.message.trim() : "";
  return sanitizeErrorMessage(top, "");
}

/** Format string or Error for inline display (non-API). */
export function displayError(value, fallback) {
  if (value == null) return fallback || "";
  return sanitizeErrorMessage(value, fallback || "Something went wrong. Refresh the page and try again.");
}
