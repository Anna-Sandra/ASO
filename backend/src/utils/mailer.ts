import nodemailer from "nodemailer";
import { env, getEmailTransportDiagnostics, isEmailTransportConfigured } from "../config/env";
import { EmailLog } from "../modules/emailLog/emailLog.model";

type Transporter = ReturnType<typeof nodemailer.createTransport>;

let cached: Transporter | null = null;

function buildTransporter(): Transporter | null {
  if (!isEmailTransportConfigured()) return null;

  const hasSmtp = Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER && env.SMTP_PASS);
  if (hasSmtp) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  }

  // Gmail: leave SMTP_HOST empty, set EMAIL_USER + EMAIL_PASS (Google App Password).
  if (env.EMAIL_USER && env.EMAIL_PASS) {
    const pass = env.EMAIL_PASS.replace(/\s/g, "");
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.EMAIL_USER, pass }
    });
  }

  return null;
}

function getTransporter(): Transporter | null {
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
 * Send HTML email. If mail is not configured, logs a dev line and no-ops (and writes a skipped EmailLog row).
 * Uses either SMTP (SMTP_*) or Gmail (EMAIL_USER + EMAIL_PASS, SMTP_HOST empty).
 */
export async function sendEmail(to: string, subject: string, html: string, meta?: SendEmailMeta) {
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
    console.log("[email:not-configured]", { to, subject, html: html.replace(/\s+/g, " ").slice(0, 200) });
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "sendMail failed";
    await recordEmailLog({
      to: to.slice(0, 320),
      subject: subject.slice(0, 500),
      category,
      status: "failed",
      errorMessage: msg.slice(0, 2000)
    });
    throw err;
  }
}
