import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

// Load backend/.env even when the process cwd is the repo root or another folder.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: z.string().min(1),
  APP_ORIGIN: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  COOKIE_DOMAIN: z.string().optional().default(""),

  EMAIL_FROM: z.string().min(1).default("Campus Market <no-reply@campus.local>"),
  /**
   * Gmail (recommended for dev): 2-Step Verification → App password for “Mail”.
   * If both are set and `SMTP_HOST` is empty, the mailer uses Nodemailer `service: "gmail"`.
   * Remove spaces from the app password in .env or leave them; they are stripped at send time.
   */
  EMAIL_USER: z.string().optional().default(""),
  EMAIL_PASS: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMS_PROVIDER: z.enum(["none", "twilio"]).optional().default("none"),
  TWILIO_ACCOUNT_SID: z.string().optional().default(""),
  TWILIO_AUTH_TOKEN: z.string().optional().default(""),
  TWILIO_FROM_NUMBER: z.string().optional().default(""),

  PAYMENTS_PROVIDER: z.string().optional().default("stripe"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),

  /** Paystack secret key (sk_live_… / sk_test_…). Used for transaction initialize + webhook HMAC. */
  PAYSTACK_SECRET_KEY: z.string().optional().default(""),

  /**
   * When `true`, after a successful online (Paystack) charge the API sends each vendor their `sellerProceeds` via
   * Paystack Transfers (from your Paystack balance). Requires `Transfers` enabled in Paystack and each seller
   * to register via `POST /api/vendor/paystack/payout-account` (stores `paystackTransferRecipientCode`).
   */
  PAYSTACK_AUTO_VENDOR_PAYOUT: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().toLowerCase() === "true"),

  /**
   * When `true` (default), Paystack checkout uses split payment: each seller’s `sellerProceeds` are routed to their
   * Paystack **subaccount** on the charge (`dynamic split` or `subaccount` + `transaction_charge`). Sellers receive
   * `paystackSubaccountCode` when they save `POST /api/vendor/paystack/payout-account`. Set to `false` for legacy
   * behavior: full settlement to the main merchant account plus optional `PAYSTACK_AUTO_VENDOR_PAYOUT` transfers.
   */
  PAYSTACK_CHECKOUT_SPLIT: z
    .string()
    .optional()
    .transform(() => false),

  /**
   * Platform service fee rate applied to the seller’s listing subtotal (vendor price × qty), added on top for the buyer.
   * Stored orders also use `PlatformSettings.commissionPercent` when set.
   */
  PLATFORM_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(5),

  /**
   * Linear model for Paystack’s share of the buyer charge: buyerTotal – sellerSettles ≈ pct×buyerTotal + fixedGhs.
   * Tuned to your Paystack Ghana plan; buyer total is solved so (buyerTotal − fee) = listingSubtotal + serviceFee.
   */
  PAYSTACK_CHECKOUT_FEE_PERCENT: z.coerce.number().min(0).max(100).default(1.95),
  PAYSTACK_CHECKOUT_FEE_FIXED_GHS: z.coerce.number().min(0).default(0.1),

  /** When true, new users are verified immediately and login does not require verification. Use only in local/dev. */
  AUTH_SKIP_EMAIL_VERIFICATION: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().toLowerCase() === "true"),

  /**
   * When true, buyers may post a star rating + comment without linking a paid order (still one review per buyer per product).
   * Use only for local demos; keep false in production so reviews stay purchase-verified.
   */
  REVIEWS_SKIP_VERIFIED_PURCHASE: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().toLowerCase() === "true"),

  /**
   * Optional. When set, all `/api/admin` requests require header `X-Admin-Secret: <this>` in addition
   * to a JWT for user role `admin`. Set the same value in the frontend as `REACT_APP_ADMIN_API_KEY` for the SPA.
   */
  ADMIN_ACCESS_SECRET: z.string().optional().default(""),

  /**
   * Fixed platform admin: on API startup, create or update this user to `role: admin` with this password.
   * Set your real email; use a long random password and keep it only in .env (never commit).
   * These same credentials also allow sign-in when MongoDB is empty or unreachable (JWT `sub` below).
   */
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(""),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(""),

  /**
   * Optional 24-character hex MongoDB ObjectId string used as JWT subject for env-only admin sessions.
   * Must stay stable so the same admin session id is used after DB loss. If unset, a built-in reserved id is used.
   */
  BOOTSTRAP_ADMIN_JWT_SUB: z.string().optional().default(""),

  /**
   * Local AI (optional). When set — e.g. http://127.0.0.1:11434 — POST /api/assistant/chat uses Ollama.
   */
  OLLAMA_BASE_URL: z.string().optional().default(""),

  /** Model name understood by local Ollama (e.g. llama3, mistral). */
  OLLAMA_MODEL: z.string().optional().default("llama3"),

  /**
   * Comma- or semicolon-separated emails that count as the platform "super" admin in addition
   * to `BOOTSTRAP_ADMIN_EMAIL` (if set). Super admins can grant `admin` to other user accounts.
   * Normal (non-super) admins cannot promote users to admin.
   */
  SUPER_USER_EMAILS: z.string().optional().default("")
});

const _env = envSchema.parse(process.env);
export const env = _env;

const SUPER_EMAILS_NORMALIZED: string[] = (() => {
  const extra = _env.SUPER_USER_EMAILS || "";
  return extra
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
})();

/**
 * "Super" admins get JWT `al: "super"` and may grant admin to other accounts.
 * The bootstrap `BOOTSTRAP_ADMIN_EMAIL` (when that user exists in Mongo) is always super.
 * Additional addresses come from `SUPER_USER_EMAILS`.
 * Env-only bootstrap login (no DB user) is always super; env-only `sub` in JWT, not an email.
 */
export function isSuperUserAdminEmail(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  const boot = (_env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  if (boot && e === boot) return true;
  return SUPER_EMAILS_NORMALIZED.includes(e);
}

/** When true, buyer charges use Paystack only (manual MoMo/bank submission and Stripe checkout are disabled in the API). */
export function isPaystackMoneyRailEnabled(): boolean {
  return Boolean(_env.PAYSTACK_SECRET_KEY?.trim());
}

/** Always false: escrow model — all funds settle to the main merchant account. */
export function isPaystackCheckoutSplitEnabled(): boolean {
  return false;
}

/** True when the API can send real email (Gmail app password or any SMTP with credentials). */
export function isEmailTransportConfigured(): boolean {
  if (_env.SMTP_HOST?.trim() && _env.SMTP_USER && _env.SMTP_PASS) return true;
  if (_env.EMAIL_USER && _env.EMAIL_PASS && !_env.SMTP_HOST?.trim()) return true;
  return false;
}

export type EmailTransportDiagnostics = {
  configured: boolean;
  mode: "smtp" | "gmail" | "none";
  /** Variables that are missing or empty for the inferred setup path. */
  missingVariables: string[];
  /** Human-readable next steps. */
  hints: string[];
};

/**
 * Explains why mail might not send and which .env keys to set.
 */
export function getEmailTransportDiagnostics(): EmailTransportDiagnostics {
  const smtpHost = (_env.SMTP_HOST || "").trim();
  const hasSmtpUser = Boolean((_env.SMTP_USER || "").trim());
  const hasSmtpPass = Boolean((_env.SMTP_PASS || "").trim());
  const emailUser = (_env.EMAIL_USER || "").trim();
  const emailPass = (_env.EMAIL_PASS || "").trim();

  const smtpPathComplete = Boolean(smtpHost && hasSmtpUser && hasSmtpPass);
  const gmailPathComplete = Boolean(emailUser && emailPass && !smtpHost);

  const hints: string[] = [];
  const missing: string[] = [];

  if (smtpPathComplete || gmailPathComplete) {
    const from = (_env.EMAIL_FROM || "").trim();
    if (!from) hints.push("Set EMAIL_FROM (e.g. Campus Mart <no-reply@yourdomain.com>).");
    else if (/no-reply@campus\.local/i.test(from)) {
      hints.push("EMAIL_FROM still looks like a dev default — use a real domain in production to avoid spam filters.");
    }
    return {
      configured: isEmailTransportConfigured(),
      mode: smtpPathComplete ? "smtp" : "gmail",
      missingVariables: [],
      hints
    };
  }

  if (smtpHost) {
    if (!hasSmtpUser) missing.push("SMTP_USER");
    if (!hasSmtpPass) missing.push("SMTP_PASS");
    hints.push(
      "SMTP_HOST is set — finish SMTP_USER and SMTP_PASS (and optional SMTP_PORT), or clear SMTP_HOST to use Gmail with EMAIL_USER + EMAIL_PASS instead."
    );
  } else {
    if (!emailUser) missing.push("EMAIL_USER");
    if (!emailPass) missing.push("EMAIL_PASS");
    hints.push(
      "With SMTP_HOST empty, Gmail is used: set EMAIL_USER and EMAIL_PASS (Google App Password). For custom SMTP, set SMTP_HOST, SMTP_USER, and SMTP_PASS."
    );
  }

  const fromMissing = !(_env.EMAIL_FROM || "").trim();
  if (fromMissing) {
    missing.push("EMAIL_FROM");
    hints.push("EMAIL_FROM is required so recipients see a valid From: address.");
  }

  return {
    configured: false,
    mode: "none",
    missingVariables: [...new Set(missing)],
    hints: [...new Set(hints)]
  };
}

