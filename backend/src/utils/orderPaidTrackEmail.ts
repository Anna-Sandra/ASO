import type { HydratedDocument } from "mongoose";
import mongoose from "mongoose";
import { env, isEmailTransportConfigured } from "../config/env";
import type { OrderDoc } from "../modules/orders/order.model";
import { Order } from "../modules/orders/order.model";
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
  return String(orderId).slice(-8).toUpperCase();
}

function itemSummary(items: OrderDoc["items"] | undefined): string {
  const list = items || [];
  const names = list.slice(0, 4).map((it) => escapeHtml(String(it.name || "Item").trim()));
  const extra = list.length > 4 ? ` +${list.length - 4} more` : "";
  return names.join(", ") + extra;
}

export function buildOrderPaidTrackEmailHtml(opts: {
  buyerName: string;
  orderId: string;
  itemSummary: string;
  trackUrl: string;
}): string {
  const name = escapeHtml(opts.buyerName.trim() || "there");
  const ref = escapeHtml(orderShortId(opts.orderId));
  const url = escapeHtml(opts.trackUrl);
  return `
<div style="font-family:system-ui,sans-serif;max-width:520px;color:#0f172a">
  <p>Hi ${name},</p>
  <p>Payment received — thank you. Your order <strong>#${ref}</strong> is confirmed.</p>
  <p style="margin:12px 0;padding:12px 14px;background:#fff7ed;border-radius:10px;border:1px solid #fed7aa;font-size:14px">
    ${opts.itemSummary}
  </p>
  <p style="font-size:14px;color:#475569">Use the button below anytime to see live delivery tracking (rider location on the map when your courier is on the way).</p>
  <p style="margin:22px 0">
    <a href="${url}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">
      Track your order
    </a>
  </p>
  <p style="font-size:12px;color:#64748b;word-break:break-all">Or open this link:<br/><a href="${url}" style="color:#0284c7">${url}</a></p>
  <p style="font-size:13px;color:#64748b">Keep this email — you can track even if you did not tap Track order after payment.</p>
</div>`.trim();
}

/**
 * Emails the buyer a track link after payment.
 * Guests get `/track/:orderId?t=<guestAccessSecret>`; signed-in buyers get `/track/:orderId`.
 */
export async function sendOrderPaidTrackEmail(orderIdStr: string): Promise<boolean> {
  if (!isEmailTransportConfigured()) return false;
  if (!mongoose.isValidObjectId(orderIdStr)) return false;

  const order = (await Order.findById(orderIdStr).select(
    "+guestAccessSecret items guestContact buyerId paidTrackEmailSentAt status fulfillmentMode"
  )) as HydratedDocument<OrderDoc> | null;
  if (!order) return false;
  if (order.paidTrackEmailSentAt) return false;
  if (!["paid", "processing", "sent_for_delivery", "delivered"].includes(String(order.status))) return false;
  if (order.fulfillmentMode === "onsite") {
    // No courier map for onsite — still skip duplicate; no track email needed.
    return false;
  }

  let buyerEmail = "";
  let buyerName = "there";
  if (order.buyerId) {
    const buyer = await User.findById(order.buyerId).select("email displayName").lean();
    buyerEmail = String((buyer as { email?: string })?.email || "").trim();
    buyerName =
      String((buyer as { displayName?: string })?.displayName || "").trim() ||
      buyerEmail.split("@")[0] ||
      "there";
  } else if (order.guestContact?.email) {
    buyerEmail = String(order.guestContact.email).trim();
    buyerName =
      String(order.guestContact.displayName || "").trim() || buyerEmail.split("@")[0] || "there";
  }

  if (!buyerEmail) return false;

  const origin = env.APP_ORIGIN.replace(/\/$/, "");
  const oid = order._id.toString();
  const secret = String(order.guestAccessSecret || "").trim();
  const trackUrl =
    !order.buyerId && secret
      ? `${origin}/track/${encodeURIComponent(oid)}?t=${encodeURIComponent(secret)}`
      : `${origin}/track/${encodeURIComponent(oid)}`;

  const html = buildOrderPaidTrackEmailHtml({
    buyerName,
    orderId: oid,
    itemSummary: itemSummary(order.items),
    trackUrl
  });
  const ref = orderShortId(oid);
  const result = await sendEmail(buyerEmail, `Track your order #${ref}`, html, {
    category: "order_paid_track"
  });

  if (result.ok) {
    order.paidTrackEmailSentAt = new Date();
    await order.save();
    return true;
  }
  return false;
}
