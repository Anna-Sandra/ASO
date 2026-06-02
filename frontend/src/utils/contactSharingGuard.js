/**
 * Client-side mirror of backend contact-sharing rules (messages & notes).
 */

const EMAIL_PATTERN =
  /[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+/i;

const OBFUSCATED_EMAIL_PATTERN =
  /\b[a-z0-9._%+-]+\s*(?:@|at)\s*(?:gmail|yahoo|hotmail|outlook|icloud|proton|live|mail)\b/i;

const GHANA_PHONE_PATTERN =
  /(?:\+?\s*233|0)\s*[235]\d[\s.\-()]*\d{3}[\s.\-()]*\d{4}\b|\b0[235]\d{8}\b|\b233[235]\d{8}\b/i;

const LONG_DIGIT_RUN = /\b\d[\d\s.\-()]{8,}\d\b/;

const SOCIAL_CONTACT_PATTERN =
  /\b(?:whatsapp|wa\.me|telegram|t\.me|signal|viber|dm\s+me|call\s+me\s+at|text\s+me\s+at)\b/i;

export const CONTACT_SHARING_BLOCKED_MESSAGE =
  "Phone numbers and email addresses cannot be shared in messages. Use in-app chat on SHOPIQGH instead.";

/** @param {string} text */
export function containsContactSharing(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  const t = raw.replace(/\s+/g, " ");
  if (EMAIL_PATTERN.test(t)) return true;
  if (OBFUSCATED_EMAIL_PATTERN.test(t)) return true;
  if (GHANA_PHONE_PATTERN.test(t)) return true;
  if (SOCIAL_CONTACT_PATTERN.test(t)) return true;
  if (LONG_DIGIT_RUN.test(t)) {
    const digits = t.replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) return true;
  }
  return false;
}
