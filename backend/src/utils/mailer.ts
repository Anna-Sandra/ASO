import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env, getEmailTransportDiagnostics, isEmailTransportConfigured } from "../config/env";
import { EmailLog } from "../modules/emailLog/emailLog.model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: Transporter<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTransporter(): Transporter<any> | null {
  if (!isEmailTransportConfigured()) return null;

  const hasSmtp = Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER && env.SMTP_PASS);
  if (hasSmtp) {
    const smtpOptions: SMTPTransport.Options = {
      host: env.SMTP_HOST!.trim(),
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    };
    return nodemailer.createTransport(smtpOptions);
  }

  // Gmail via explicit SMTP host — forces IPv4 (Render free tier has no IPv6)
  if (env.EMAIL_USER && env.EMAIL_PASS) {
    const pass = env.EMAIL_PASS.replace(/\s/g, "");
    const gmailOptions: SMTPTransport.Options = {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: env.EMAIL_USER, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    };
    return nodemailer.createTransport(gmailOptions);
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTransporter(): Transporter<any> | null {
  if (cached) return cached;
  cached = buildTransporter();
  return cached;
}

export type SendEmailMeta = { category?: string };

async function recordEmailLog(entry: {
  to: string;
  subject: string;
  category: string;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string;
}) {
  try {
    await EmailLog.create(entry);
  } catch {
    /* avoid breaking sends if logging fails */
  }
}

/**
 * Send HTML email. If mail is not configured, logs a dev line and no-ops.
 * Uses either SMTP (SMTP_*) or Gmail (EMAIL_USER + EMAIL_PASS, SMTP_HOST empty).
 * Never throws — email failure is logged but never crashes the caller.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  meta?: SendEmailMeta
) {
  const category = (meta?.category || "general").slice(0, 80);
  const transporter = getTransporter();

  if (!transporter) {
    const diag = getEmailTransportDiagnostics();
    const reason =
      diag.missingVariables.length > 0
        ? `Not configured — set: ${diag.missingVariables.join(", ")}`
        : "Not configured — check EMAIL_USER/EMAIL_PASS or SMTP_* in .env";
    await recordEmailLog({
      to: to.slice(0, 320),
      subject: subject.slice(0, 500),
      category,
      status: "skipped",
      errorMessage: reason
    });
    // eslint-disable-next-line no-console
    console.log("[email:not-configured]", {
      to,
      subject,
      html: html.replace(/\s+/g, " ").slice(0, 200)
    });
    return;
  }

  try {
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      html
    });
    await recordEmailLog({
      to: to.slice(0, 320),
      subject: subject.slice(0, 500),
      category,
      status: "sent"
    });
    // eslint-disable-next-line no-console
    console.log("[email:sent]", { to, subject });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "sendMail failed";
    await recordEmailLog({
      to: to.slice(0, 320),
      subject: subject.slice(0, 500),
      category,
      status: "failed",
      errorMessage: msg.slice(0, 2000)
    });
    // eslint-disable-next-line no-console
    console.error("[email:failed]", msg);
    // Never throw — email failure must not crash login/register flows
  }
}