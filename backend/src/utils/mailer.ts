import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env, getEmailTransportDiagnostics, isEmailTransportConfigured } from "../config/env";
import { EmailLog } from "../modules/emailLog/emailLog.model";
import { parseEmailFrom } from "./emailFrom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: Transporter<any> | null = null;

function maskEmailAddress(value: string): string {
  const v = String(value || "").trim().toLowerCase();
  if (!v || !v.includes("@")) return "(unknown)";
  const [local, domain] = v.split("@");
  if (!local || !domain) return "(unknown)";
  const localMasked = local.length <= 2 ? `${local[0] || "*"}*` : `${local[0]}***${local[local.length - 1]}`;
  return `${localMasked}@${domain}`;
}

function brevoSender() {
  const email = (env.BREVO_SENDER_EMAIL || parseEmailFrom(env.EMAIL_FROM).email).trim().toLowerCase();
  const name = (env.BREVO_SENDER_NAME || parseEmailFrom(env.EMAIL_FROM).name).trim() || "SHOPIQGH";
  return { name, email };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTransporter(): Transporter<any> | null {
  if ((env.BREVO_API_KEY || "").trim()) return null;

  const hasSmtp = Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER && env.SMTP_PASS);
  if (hasSmtp) {
    const smtpOptions: SMTPTransport.Options = {
      host: env.SMTP_HOST!.trim(),
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER!, pass: (env.SMTP_PASS || "").replace(/\s/g, "") },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    };
    return nodemailer.createTransport(smtpOptions);
  }

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

export type SendEmailResult =
  | { ok: true }
  | { ok: false; reason: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyTransientBrevoFailure(reason: string): boolean {
  const r = String(reason || "").toLowerCase();
  return (
    r.includes("timed out") ||
    r.includes("fetch failed") ||
    r.includes("network") ||
    r.includes("econnreset") ||
    r.includes("503") ||
    r.includes("502") ||
    r.includes("504")
  );
}

async function sendViaBrevo(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const apiKey = (env.BREVO_API_KEY || "").trim();
  if (!apiKey) return { ok: false, reason: "Brevo API key not set" };

  const sender = brevoSender();
  if (!sender.email) {
    return {
      ok: false,
      reason: "Set EMAIL_FROM (e.g. SHOPIQGH <you@gmail.com>) or BREVO_SENDER_EMAIL to your verified Brevo sender."
    };
  }

  const maxAttempts = 2;
  let lastFailure = "Brevo request failed";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          sender: { name: sender.name, email: sender.email },
          to: [{ email: to.trim().toLowerCase() }],
          subject,
          htmlContent: html,
          textContent: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        }),
        signal: controller.signal
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string; messageId?: string };
      if (!res.ok) {
        const msg = body.message || body.code || `Brevo HTTP ${res.status}`;
        lastFailure = msg;
        if (attempt < maxAttempts && isLikelyTransientBrevoFailure(msg)) {
          await sleep(600);
          continue;
        }
        return { ok: false, reason: msg };
      }
      if (body.messageId) {
        // eslint-disable-next-line no-console
        console.log("[email:brevo:messageId]", body.messageId);
      }
      return { ok: true };
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === "AbortError"
          ? "Brevo request timed out"
          : err instanceof Error
            ? err.message
            : "Brevo request failed";
      lastFailure = msg;
      if (attempt < maxAttempts && isLikelyTransientBrevoFailure(msg)) {
        await sleep(600);
        continue;
      }
      return { ok: false, reason: msg };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: lastFailure };
}

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
 * Send HTML email. Priority: Brevo API (HTTPS) → SMTP → Gmail SMTP.
 * Brevo works on Render free tier; verify your Gmail as a sender in the Brevo dashboard first.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  meta?: SendEmailMeta
): Promise<SendEmailResult> {
  const category = (meta?.category || "general").slice(0, 80);
  const maskedTo = maskEmailAddress(to);

  if ((env.BREVO_API_KEY || "").trim()) {
    const result = await sendViaBrevo(to, subject, html);
    if (result.ok) {
      await recordEmailLog({
        to: to.slice(0, 320),
        subject: subject.slice(0, 500),
        category,
        status: "sent"
      });
      // eslint-disable-next-line no-console
      console.log("[email:sent:brevo]", { to: maskedTo, category });
      return result;
    }
    await recordEmailLog({
      to: to.slice(0, 320),
      subject: subject.slice(0, 500),
      category,
      status: "failed",
      errorMessage: result.reason.slice(0, 2000)
    });
    // eslint-disable-next-line no-console
    console.error("[email:failed:brevo]", { to: maskedTo, category, error: result.reason });
    return result;
  }

  const transporter = getTransporter();

  if (!transporter) {
    const diag = getEmailTransportDiagnostics();
    const reason =
      diag.missingVariables.length > 0
        ? `Not configured — set: ${diag.missingVariables.join(", ")}`
        : "Not configured — set BREVO_API_KEY (production) or SMTP_* / EMAIL_USER+EMAIL_PASS (local).";
    await recordEmailLog({
      to: to.slice(0, 320),
      subject: subject.slice(0, 500),
      category,
      status: "skipped",
      errorMessage: reason
    });
    // eslint-disable-next-line no-console
    console.log("[email:not-configured]", {
      to: maskedTo,
      category
    });
    return { ok: false, reason };
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
    console.log("[email:sent]", { to: maskedTo, category });
    return { ok: true };
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
    console.error("[email:failed]", { to: maskedTo, category, error: msg });
    return { ok: false, reason: msg };
  }
}
