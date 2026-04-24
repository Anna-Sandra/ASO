import bcrypt from "bcrypt";
import { env } from "./env";
import { User } from "../modules/auth/user.model";

const SALT_ROUNDS = 12;

/** Min length for a bootstrap secret (no client-side register rules; login accepts any match). */
const MIN_PASSWORD_LEN = 8;

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
      "[bootstrap-admin] BOOTSTRAP_ADMIN_EMAIL is unset — no platform admin is seeded. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (8+ chars) in .env, then restart the API so /api/auth/login can find that user."
    );
    return;
  }

  const email = emailRaw.toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!password || password.length < MIN_PASSWORD_LEN) {
    // eslint-disable-next-line no-console
    console.warn(
      `[bootstrap-admin] BOOTSTRAP_ADMIN_EMAIL is set but BOOTSTRAP_ADMIN_PASSWORD is missing or shorter than ${MIN_PASSWORD_LEN} characters — skipping admin seed.`
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
