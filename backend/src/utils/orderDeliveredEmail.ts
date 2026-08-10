import type { HydratedDocument } from "mongoose";
import mongoose from "mongoose";
import { isEmailTransportConfigured } from "../config/env";
import type { OrderDoc } from "../modules/orders/order.model";
import { User } from "../modules/auth/user.model";
import { sendEmail } from "./mailer";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function orderShortId(orderId: mongoose.Types.ObjectId | string): string {
  const s = String(orderId);
  return s.slice(-8).toUpperCase();
}

function itemSummary(items: OrderDoc["items"]): string {
  const names = items.slice(0, 4).map((it) => escapeHtml(String(it.name || "Item").trim()));
  const extra = items.length > 4 ? ` +${items.length - 4} more` : "";
  return names.join(", ") + extra;
}

export function buildBuyerDeliveredEmailHtml(opts: {
  buyerName: string;
  orderId: string;
  itemSummary: string;
  trackHint: string;
}): string {
  const name = escapeHtml(opts.buyerName.trim() || "there");
  const ref = escapeHtml(orderShortId(opts.orderId));
  return `
<div style="font-family:system-ui,sans-serif;max-width:520px;color:#0f172a">
  <p>Hi ${name},</p>
  <p>Your order <strong>#${ref}</strong> has been marked <strong>delivered</strong>.</p>
  <p style="margin:12px 0;padding:12px 14px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;font-size:14px">
    ${opts.itemSummary}
  </p>
  <p style="font-size:14px;color:#475569">${escapeHtml(opts.trackHint)}</p>
  <p style="font-size:13px;color:#64748b">Thank you for shopping on SHOPIQGH.</p>
</div>`.trim();
}

export function buildSellerDeliveredEmailHtml(opts: {
  sellerName: string;
  orderId: string;
  itemSummary: string;
}): string {
  const name = escapeHtml(opts.sellerName.trim() || "there");
  const ref = escapeHtml(orderShortId(opts.orderId));
  return `
<div style="font-family:system-ui,sans-serif;max-width:520px;color:#0f172a">
  <p>Hi ${name},</p>
  <p>Order <strong>#${ref}</strong> for your listing(s) was marked <strong>delivered</strong> by the courier or fulfillment flow.</p>
  <p style="margin:12px 0;padding:12px 14px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;font-size:14px">
    ${opts.itemSummary}
  </p>
  <p style="font-size:13px;color:#64748b">Open your vendor dashboard to review the order if needed.</p>
</div>`.trim();
}

/** Sends delivery-complete emails once per order (buyer + each seller on the order). */
export async function sendOrderDeliveredEmails(order: HydratedDocument<OrderDoc>): Promise<boolean> {
  if (!isEmailTransportConfigured()) return false;
  if (order.deliveredEmailsSentAt) return false;

  const summary = itemSummary(order.items || []);
  const oid = order._id.toString();
  const ref = orderShortId(oid);

  let buyerEmail = "";
  let buyerName = "there";
  if (order.buyerId) {
    const buyer = await User.findById(order.buyerId).select("email displayName").lean();
    buyerEmail = String((buyer as { email?: string })?.email || "").trim();
    buyerName = String((buyer as { displayName?: string })?.displayName || "").trim() || buyerEmail.split("@")[0] || "there";
  } else if (order.guestContact?.email) {
    buyerEmail = String(order.guestContact.email).trim();
    buyerName = String(order.guestContact.displayName || "").trim() || buyerEmail.split("@")[0] || "there";
  }

  const sellerIds = [...new Set(order.items.map((it) => it.sellerId.toString()))].filter((id) =>
    mongoose.isValidObjectId(id)
  );

  let sentAny = false;

  if (buyerEmail) {
    const html = buildBuyerDeliveredEmailHtml({
      buyerName,
      orderId: oid,
      itemSummary: summary,
      trackHint: "You can review the order under My orders, or reopen the Track link from your payment email."
    });
    const ok = await sendEmail(buyerEmail, `Delivered — order #${ref}`, html, { category: "order_delivered_buyer" });
    if (ok.ok) sentAny = true;
  }

  for (const sid of sellerIds) {
    const seller = await User.findById(sid).select("email displayName").lean();
    const email = String((seller as { email?: string })?.email || "").trim();
    if (!email) continue;
    const sellerName = String((seller as { displayName?: string })?.displayName || "").trim() || email.split("@")[0] || "there";
    const html = buildSellerDeliveredEmailHtml({ sellerName, orderId: oid, itemSummary: summary });
    const ok = await sendEmail(email, `Order #${ref} delivered to customer`, html, { category: "order_delivered_seller" });
    if (ok.ok) sentAny = true;
  }

  order.deliveredEmailsSentAt = new Date();
  await order.save();
  return sentAny;
}
