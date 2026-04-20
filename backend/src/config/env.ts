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

  /** Percent of each line gross (unit price × qty) retained by the platform; remainder goes to the seller (accounting). */
  PLATFORM_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(7),

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
    .transform((v) => (v ?? "").trim().toLowerCase() === "true")
});

export const env = envSchema.parse(process.env);

