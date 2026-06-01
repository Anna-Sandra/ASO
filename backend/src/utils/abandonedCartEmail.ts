import { DEFAULT_SITE_NAME } from "../config/brand";
import { env } from "../config/env";
import { sendEmail } from "./mailer";

export async function sendAbandonedCartEmail(opts: {
  to: string;
  displayName?: string;
  itemSummary: string;
  checkoutUrl: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const to = String(opts.to || "").trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, reason: "no_email" };
  const name = String(opts.displayName || "").trim() || "there";
  const shop = env.APP_ORIGIN.replace(/\/$/, "");
  const url = opts.checkoutUrl || `${shop}/checkout`;
  const html = `
    <p>Hi ${name},</p>
    <p>You left items in your ${DEFAULT_SITE_NAME} cart:</p>
    <p><strong>${opts.itemSummary}</strong></p>
    <p><a href="${url}">Complete your order</a> before they sell out.</p>
    <p style="color:#64748b;font-size:13px;">If you already paid, you can ignore this email.</p>
  `;
  const result = await sendEmail(to, `You left items in your ${DEFAULT_SITE_NAME} cart`, html, {
    category: "abandoned_cart"
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function sendAbandonedCheckoutEmail(opts: {
  to: string;
  displayName?: string;
  orderId: string;
  totalGhs: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const to = String(opts.to || "").trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, reason: "no_email" };
  const name = String(opts.displayName || "").trim() || "there";
  const shop = env.APP_ORIGIN.replace(/\/$/, "");
  const url = `${shop}/checkout`;
  const html = `
    <p>Hi ${name},</p>
    <p>Your ${DEFAULT_SITE_NAME} checkout (order <strong>${opts.orderId.slice(-8)}</strong>) is still waiting for payment — total <strong>GHS ${opts.totalGhs.toFixed(2)}</strong>.</p>
    <p><a href="${url}">Return to checkout</a> to complete your purchase.</p>
  `;
  const result = await sendEmail(to, `Complete your ${DEFAULT_SITE_NAME} order`, html, {
    category: "abandoned_checkout"
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
