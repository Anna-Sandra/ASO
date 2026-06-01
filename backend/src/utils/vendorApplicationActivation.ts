import type { HydratedDocument } from "mongoose";
import { env } from "../config/env";
import { createOpaqueToken, sha256 } from "../modules/auth/jwt";
import type { VendorApplicationDoc } from "../modules/vendorApplications/vendorApplication.model";
import { sendEmail } from "./mailer";
import {
  VENDOR_ACTIVATION_TTL_MS,
  buildVendorActivationEmailHtml,
  buildVendorApplicationReceivedEmailHtml
} from "./vendorActivationEmail";

export function appOriginBase(): string {
  return env.APP_ORIGIN.replace(/\/$/, "");
}

export function buildRegisterUrlForApplicantEmail(email: string): string {
  const e = (email || "").trim().toLowerCase();
  return `${appOriginBase()}/register?email=${encodeURIComponent(e)}`;
}

export function buildVendorActivationUrl(token: string): string {
  return `${appOriginBase()}/activate-account?token=${encodeURIComponent(token)}&type=vendor`;
}

/** Guest application submitted — optional shopper account before approval. */
export async function emailVendorApplicationReceived(opts: {
  email: string;
  fullName: string;
  shopName: string;
}): Promise<void> {
  const email = (opts.email || "").trim().toLowerCase();
  if (!email) return;
  const registerUrl = buildRegisterUrlForApplicantEmail(email);
  const loginUrl = `${appOriginBase()}/login`;
  await sendEmail(
    email,
    "We received your SHOPIQGH vendor application",
    buildVendorApplicationReceivedEmailHtml({
      fullName: opts.fullName,
      shopName: opts.shopName,
      registerUrl,
      loginUrl
    }),
    { category: "vendor_application_received" }
  );
}

/**
 * Issue a fresh activation token on an approved application and email the applicant.
 * Used on admin approve (guest) and resend.
 */
export async function issueVendorActivationEmail(
  app: HydratedDocument<VendorApplicationDoc>
): Promise<{ activationUrl: string }> {
  const activationToken = createOpaqueToken();
  app.activationTokenHash = sha256(activationToken);
  app.activationExpiry = new Date(Date.now() + VENDOR_ACTIVATION_TTL_MS);
  await app.save();

  const activationUrl = buildVendorActivationUrl(activationToken);
  await sendEmail(
    app.email,
    "Your SHOPIQGH vendor application has been approved!",
    buildVendorActivationEmailHtml({
      fullName: app.fullName,
      shopName: app.shopName,
      activationUrl
    }),
    { category: "vendor_approval" }
  );

  return { activationUrl };
}
