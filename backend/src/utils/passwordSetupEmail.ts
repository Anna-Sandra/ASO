import crypto from "crypto";
import mongoose from "mongoose";
import { createOpaqueToken, sha256 } from "../modules/auth/jwt";
import { Token } from "../modules/auth/token.model";
import { sendEmail } from "./mailer";
import { appOriginBase } from "./vendorApplicationActivation";

export const PASSWORD_SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Unguessable temporary password (meets app password rules) until the user completes setup. */
export function randomTemporaryPassword(): string {
  const base = crypto.randomBytes(18).toString("base64url");
  return `${base}Aa1!`;
}

export function buildPasswordSetupUrl(token: string, email: string): string {
  const e = encodeURIComponent(email.trim().toLowerCase());
  return `${appOriginBase()}/reset-password?token=${encodeURIComponent(token)}&email=${e}`;
}

export function buildPasswordSetupEmailHtml(opts: {
  displayName: string;
  accountLabel: string;
  setupUrl: string;
}): string {
  const name = escapeHtml(opts.displayName.trim() || "there");
  const label = escapeHtml(opts.accountLabel);
  const url = escapeHtml(opts.setupUrl);
  return `
<p>Hello ${name},</p>
<p>Your SHOPIQGH <strong>${label}</strong> account is ready.</p>
<p>For security, create your own password using the link below. Do not use a password chosen by anyone else.</p>
<p><a href="${url}" style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Set your password</a></p>
<p>Or copy this link: <a href="${url}">${url}</a></p>
<p>This link expires in 7 days. After you set your password, sign in at ${escapeHtml(`${appOriginBase()}/login`)}.</p>
<p>If you were not expecting this email, contact platform support.</p>
`.trim();
}

/**
 * Email a one-time link to /reset-password so the user chooses their own password.
 */
export async function issuePasswordSetupEmail(opts: {
  userId: mongoose.Types.ObjectId;
  email: string;
  displayName?: string;
  accountLabel: "rider" | "vendor";
}): Promise<{ setupUrl: string }> {
  const email = opts.email.trim().toLowerCase();
  const token = createOpaqueToken();
  await Token.updateMany(
    { userId: opts.userId, purpose: "password_setup", usedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  await Token.create({
    userId: opts.userId,
    purpose: "password_setup",
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + PASSWORD_SETUP_TTL_MS)
  });
  const setupUrl = buildPasswordSetupUrl(token, email);
  const label = opts.accountLabel === "rider" ? "courier (rider)" : "vendor (seller)";
  await sendEmail(
    email,
    "Set your SHOPIQGH password",
    buildPasswordSetupEmailHtml({
      displayName: opts.displayName || "",
      accountLabel: label,
      setupUrl
    }),
    { category: "password_setup" }
  );
  return { setupUrl };
}
