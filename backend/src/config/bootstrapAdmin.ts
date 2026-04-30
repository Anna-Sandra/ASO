import bcrypt from "bcrypt";
import crypto from "crypto";
import mongoose from "mongoose";
import { env } from "./env";
import { User, type VendorProfileStatus } from "../modules/auth/user.model";

const SALT_ROUNDS = 12;

/** Min length for a bootstrap secret (no client-side register rules; login accepts any match). */
export const MIN_BOOTSTRAP_PASSWORD_LEN = 8;

/** Reserved 24-hex ObjectId for JWT `sub` when admin signs in from env only (no Mongo user). */
const DEFAULT_BOOTSTRAP_JWT_SUB = "a0000000d0000000abadfeed";

if (!/^[a-f0-9]{24}$/.test(DEFAULT_BOOTSTRAP_JWT_SUB)) {
  // Self-check: this constant must be a valid 24-char hex ObjectId so it can be
  // stored in fields like `resolvedById` without crashing BSON.
  throw new Error("[bootstrap-admin] DEFAULT_BOOTSTRAP_JWT_SUB must be 24 hex chars");
}

function timingSafeEqualUtf8(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function isEnvBootstrapAdminConfigured(): boolean {
  const email = (env.BOOTSTRAP_ADMIN_EMAIL || "").trim();
  const pw = env.BOOTSTRAP_ADMIN_PASSWORD || "";
  return email.length > 0 && pw.length >= MIN_BOOTSTRAP_PASSWORD_LEN;
}

export function envBootstrapAdminEmailNormalized(): string | null {
  const e = (env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  return e || null;
}

/** True when identifier/password match BOOTSTRAP_ADMIN_* (no database required). */
export function matchesEnvBootstrapAdmin(identifier: string, password: string): boolean {
  if (!isEnvBootstrapAdminConfigured()) return false;
  const want = envBootstrapAdminEmailNormalized();
  if (!want || identifier.trim().toLowerCase() !== want) return false;
  return timingSafeEqualUtf8(password, env.BOOTSTRAP_ADMIN_PASSWORD);
}

export function getBootstrapAdminJwtSub(): string {
  const raw = (env.BOOTSTRAP_ADMIN_JWT_SUB || "").trim().toLowerCase();
  if (!raw) return DEFAULT_BOOTSTRAP_JWT_SUB;
  if (!/^[a-f0-9]{24}$/.test(raw)) {
    // eslint-disable-next-line no-console
    console.warn("[bootstrap-admin] BOOTSTRAP_ADMIN_JWT_SUB must be exactly 24 hex characters; using default sub.");
    return DEFAULT_BOOTSTRAP_JWT_SUB;
  }
  return raw;
}

export function isBootstrapAdminJwtSub(sub: string): boolean {
  return sub === getBootstrapAdminJwtSub();
}

export function bootstrapAdminSessionUserJson(): {
  id: string;
  email: string;
  role: "admin";
  displayName: string;
  phone: string;
  profileImageUrl: string;
  vendorStatus: VendorProfileStatus;
  businessName: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
} {
  const email = envBootstrapAdminEmailNormalized() || "";
  return {
    id: getBootstrapAdminJwtSub(),
    email,
    role: "admin",
    displayName: "Admin",
    phone: "",
    profileImageUrl: "",
    vendorStatus: "none",
    businessName: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountName: ""
  };
}

/**
 * If `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are set, ensures that user
 * exists with `role: admin` and the given password hash, and is email-verified so login
 * always works (even when `AUTH_SKIP_EMAIL_VERIFICATION` is false).
 */
export async function ensureBootstrapAdmin() {
  const emailRaw = (env.BOOTSTRAP_ADMIN_EMAIL || "").trim();
  if (!emailRaw) {
    // eslint-disable-next-line no-console
    console.info(
      "[bootstrap-admin] BOOTSTRAP_ADMIN_EMAIL is unset — no env-based platform admin. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (8+ chars) in .env to allow admin sign-in (including when MongoDB is offline)."
    );
    return;
  }

  const email = emailRaw.toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!password || password.length < MIN_BOOTSTRAP_PASSWORD_LEN) {
    // eslint-disable-next-line no-console
    console.warn(
      `[bootstrap-admin] BOOTSTRAP_ADMIN_EMAIL is set but BOOTSTRAP_ADMIN_PASSWORD is missing or shorter than ${MIN_BOOTSTRAP_PASSWORD_LEN} characters — skipping admin seed.`
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const existing = await User.findOne({ email }).select("+passwordHash");
  if (existing) {
    await User.updateOne(
      { _id: existing._id },
      {
        $set: {
          role: "admin",
          passwordHash,
          emailVerifiedAt: (existing as { emailVerifiedAt?: Date | null }).emailVerifiedAt || new Date(),
          accountStatus: "active"
        }
      }
    );
    // eslint-disable-next-line no-console
    console.log(`[bootstrap-admin] Admin account updated for ${email} (role, password, verification synced from env).`);
    return;
  }

  await User.create({
    email,
    passwordHash,
    role: "admin",
    displayName: "Admin",
    emailVerifiedAt: new Date(),
    accountStatus: "active",
    sellerVerified: true
  });
  // eslint-disable-next-line no-console
  console.log(`[bootstrap-admin] Admin account created for ${email} — you can sign in on /login.`);
}

/**
 * If every admin was removed (or DB was wiped while the API stayed up), re-run env-based seeding.
 * Call from `/login` so a restart is not required to recover access.
 */
export async function ensureBootstrapAdminIfNoAdmins() {
  if (mongoose.connection.readyState !== 1) return;
  const n = await User.countDocuments({ role: "admin" });
  if (n > 0) return;
  await ensureBootstrapAdmin();
  const after = await User.countDocuments({ role: "admin" });
  if (after === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[bootstrap-admin] There are no admin users. Set BOOTSTRAP_ADMIN_EMAIL to the email you use on /login and BOOTSTRAP_ADMIN_PASSWORD (8+ characters) in backend/.env, then sign in again or restart the API."
    );
  }
}
