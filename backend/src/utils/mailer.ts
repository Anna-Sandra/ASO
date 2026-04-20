import nodemailer from "nodemailer";
import { env } from "../config/env";

export async function sendEmail(to: string, subject: string, html: string) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    // eslint-disable-next-line no-console
    console.log("[email:dev]", { to, subject, html });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html
  });
}

