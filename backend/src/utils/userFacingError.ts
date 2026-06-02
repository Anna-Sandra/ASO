import type { ZodIssue } from "zod";

const STATUS_FALLBACKS: Record<number, string> = {
  400: "We could not accept that request. Check the form, fix any issues, and submit again.",
  401: "You need to sign in first. Sign in with your email and password, then try again.",
  403: "Your account cannot perform this action. Use the correct account type or contact support.",
  404: "We could not find that record. Refresh the page or go back and open it again from the list.",
  409: "This conflicts with existing data. Refresh the page and check the latest status.",
  413: "That file is too large. Use a smaller file (under 5 MB) and upload again.",
  429: "Too many attempts. Wait about a minute, then try again.",
  500: "Something went wrong on our side. Wait a moment, refresh, and try again.",
  502: "Our service is temporarily unavailable. Try again in a minute.",
  503: "The platform is temporarily unavailable. Try again in a few minutes."
};

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  password: "Password",
  phone: "Phone number",
  displayName: "Name",
  proofPhotoUrl: "Delivery photo",
  deliveryOtp: "Delivery code",
  dropoffLatitude: "Delivery location",
  dropoffLongitude: "Delivery location",
  dropoffLabel: "Delivery address",
  riderUserId: "Rider",
  stage: "Delivery status",
  productId: "Product",
  orderId: "Order"
};

function labelForPath(path: PropertyKey[]): string {
  const key = path.length ? String(path[path.length - 1]) : "";
  return FIELD_LABELS[key] || (key ? key.replace(/_/g, " ") : "This field");
}

function humanizeRawZodMessage(raw: string, label: string): string {
  const m = raw.trim();
  if (/Too small:\s*expected string/i.test(m)) {
    if (/>=\s*15/i.test(m)) return `Add more detail in ${label.toLowerCase()}, then submit again.`;
    if (/>=\s*8/i.test(m)) return `${label} is too short — add a bit more text and try again.`;
    return `Enter ${label.toLowerCase()}, then submit again.`;
  }
  if (/Too big:/i.test(m)) return `${label} is too long — shorten it and try again.`;
  if (/Invalid option:|Invalid enum/i.test(m)) return `Choose a valid option for ${label.toLowerCase()}, then try again.`;
  if (/expected string,\s*received undefined/i.test(m)) return `${label} is required — fill it in and submit again.`;
  return m;
}

/** Turn a Zod issue into plain language with a next step. */
export function formatZodIssueMessage(issue: ZodIssue): string {
  const label = labelForPath(issue.path);
  const custom = String(issue.message || "").trim();

  if (
    custom &&
    custom !== "Required" &&
    !/^Too (small|big):/i.test(custom) &&
    !/^Invalid (option|enum)/i.test(custom) &&
    !/^expected string/i.test(custom)
  ) {
    return custom;
  }

  if (custom) return humanizeRawZodMessage(custom, label);

  return `Enter ${label.toLowerCase()}, then submit again.`;
}

function looksTechnical(msg: string): boolean {
  if (!msg.trim()) return true;
  if (/^(Internal server error|Error)$/i.test(msg)) return true;
  if (/ECONNRESET|ETIMEDOUT|MongoServer|MongoNetwork|ZodError|TypeError:/i.test(msg)) return true;
  if (/^\s*at\s+/m.test(msg)) return true;
  if (msg.length > 300 && /\bat\b/.test(msg)) return true;
  return false;
}

/** Sanitize uncaught errors before sending to clients (production-safe). */
export function sanitizeServerErrorMessage(err: unknown, status: number): string {
  if (err instanceof Error && err.message && !looksTechnical(err.message)) {
    const m = err.message.trim();
    if (m.length <= 400) return m;
  }
  return STATUS_FALLBACKS[status] || STATUS_FALLBACKS[500];
}
