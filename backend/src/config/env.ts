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

  /**
   * Public URL origin of **this API** as the browser would load it (e.g. https://api.example.com or http://localhost:4000).
   * Used to build absolute product image URLs for the shopping assistant. Defaults to http://localhost:PORT when empty.
   */
  API_PUBLIC_ORIGIN: z.string().optional().default(""),

  /** Optional: when all three are set, uploads go to Cloudinary (persists on Render); otherwise disk under `uploads/`. */
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  COOKIE_DOMAIN: z.string().optional().default(""),

  EMAIL_FROM: z.string().min(1).default("SHOPIQGH <no-reply@SHOPIQGH.local>"),
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
   * Local AI (optional). When set — e.g. http://127.0.0.1:11434 — used for assistant chat **only if** `GROQ_API_KEY` is unset.
   */
  OLLAMA_BASE_URL: z.string().optional().default(""),

  /** Model name understood by local Ollama (e.g. llama3.2:3b, llama3.2:1b, mistral). Default 3b follows instructions better than 1b for the assistant. */
  OLLAMA_MODEL: z.string().optional().default("llama3.2:3b"),

  /**
   * How long the API waits for Ollama `/api/chat` (ms). First reply after `ollama pull` or a cold model can take minutes on CPU.
   */
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(30000).max(900000).optional().default(300000),

  /** Max new tokens per reply; lower = faster CPU; raise if replies truncate mid-URL or mid-sentence. */
  OLLAMA_NUM_PREDICT: z.coerce.number().int().min(64).max(4096).optional().default(200),

  /** Context window tokens; lower = less RAM + faster CPU prefill. 1024 fits assistant system prompt + history on typical dev CPUs. */
  OLLAMA_NUM_CTX: z.coerce.number().int().min(512).max(131072).optional().default(1024),

  /** Lower = more deterministic, better instruction-following (e.g. 0.3 for the shopping assistant). */
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).optional().default(0.3),

  /**
   * Passed to Ollama as `num_thread` when > 0 (CPU threads). 0 = omit (Ollama picks automatically).
   * Default 8 is a reasonable dev baseline; reduce on low-core machines (stay ≤ physical cores).
   */
  OLLAMA_NUM_THREAD: z.coerce.number().int().min(0).max(256).optional().default(8),

  /**
   * Groq Cloud (optional). When set, the shopping assistant calls Groq’s OpenAI-compatible API
   * (`https://api.groq.com/...`) instead of local Ollama — better quality/latency on low-RAM CPU laptops.
   * Free tier: https://console.groq.com — no credit card required.
   */
  GROQ_API_KEY: z.string().optional().default(""),

  /** Groq model ID (see Groq docs), e.g. llama3-8b-8192 */
  GROQ_MODEL: z.string().optional().default("llama3-8b-8192"),

  /** Max completion tokens for Groq chat (separate from Ollama `OLLAMA_NUM_PREDICT`). */
  GROQ_MAX_TOKENS: z.coerce.number().int().min(64).max(8192).optional().default(300),

  /**
   * HTTP timeout for Groq non-streaming completions (ms). When 0, uses `OLLAMA_TIMEOUT_MS`.
   * Streaming chat still uses the request AbortSignal timeout from `assistant.controller`.
   */
  GROQ_TIMEOUT_MS: z.coerce.number().int().min(3000).max(600000).optional().default(0),

  /**
   * Per-IP rate limit for `POST /api/assistant/chat` (sliding window length in ms). Default 15 minutes.
   */
  ASSISTANT_CHAT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(60000).max(3600000).optional().default(900000),

  /**
   * Max assistant chat POSTs per IP per window. When 0, uses 45 in production and 400 in development.
   */
  ASSISTANT_CHAT_RATE_LIMIT_MAX: z.coerce.number().int().min(0).max(5000).optional().default(0),

  /**
   * Comma- or semicolon-separated emails that count as the platform "super" admin in addition
   * to `BOOTSTRAP_ADMIN_EMAIL` (if set). Super admins can grant `admin` to other user accounts.
   * Normal (non-super) admins cannot promote users to admin.
   */
  SUPER_USER_EMAILS: z.string().optional().default(""),

  /**
   * ISO date when SHOPIQGH launched (e.g. 2026-05-15). Used for the seller free-trial window unless
   * overridden in admin platform settings. Defaults to “now” when the first settings row is created.
   */
  PLATFORM_DEPLOYED_AT: z.string().optional().default(""),

  /** Months after deployment that sellers can list without paying a platform subscription fee. */
  VENDOR_TRIAL_MONTHS: z.coerce.number().int().min(0).max(24).optional().default(2),

  /** Default annual seller platform fee (GHS) after the launch trial. */
  VENDOR_SUBSCRIPTION_PRICE_GHS: z.coerce.number().min(0).optional().default(49),

  /** How long one seller subscription payment lasts (months). */
  VENDOR_SUBSCRIPTION_PERIOD_MONTHS: z.coerce.number().int().min(1).max(36).optional().default(12)
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
    if (!from) hints.push("Set EMAIL_FROM (e.g. SHOPIQGH <no-reply@yourdomain.com>).");
    else if (/no-reply@SHOPIQGH\.local/i.test(from)) {
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

