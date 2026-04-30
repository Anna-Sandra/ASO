import type { HydratedDocument } from "mongoose";
import { Order, type OrderDoc } from "../orders/order.model";
import { Product } from "../products/product.model";

/** Paystack refund API / webhooks use this when funds have settled back to the customer. */
export function isPaystackRefundRemoteSettled(status: string): boolean {
  const s = String(status || "")
    .toLowerCase()
    .trim();
  return s === "processed" || s === "completed";
}

export async function applyProcessedPaystackRefundToOrder(o: HydratedDocument<OrderDoc>): Promise<void> {
  o.refundStatus = "refunded";
  o.paystackRefundRemoteStatus = "processed";
  if (!o.refundStockRestored) {
    for (const it of o.items) {
      await Product.updateOne({ _id: it.productId }, { $inc: { stock: it.quantity } });
    }
    o.refundStockRestored = true;
  }
}

type RefundWebhookPayload = {
  id?: number;
  status?: string;
  transaction?: { reference?: string; id?: number };
};

function coerceRefundId(data: RefundWebhookPayload): number | null {
  const n = Number(data.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function findOrderForRefundWebhook(data: RefundWebhookPayload): Promise<HydratedDocument<OrderDoc> | null> {
  const refundId = coerceRefundId(data);
  if (refundId != null) {
    const byRefund = await Order.findOne({ paystackRefundId: refundId });
    if (byRefund) return byRefund;
  }
  const ref = data.transaction?.reference ? String(data.transaction.reference).trim() : "";
  if (ref) {
    const byRef = await Order.findOne({
      paymentMethod: "paystack",
      $or: [{ paystackReference: ref }, { paymentReference: ref }]
    });
    if (byRef) return byRef;
  }
  const txnId = Number(data.transaction?.id);
  if (Number.isFinite(txnId) && txnId > 0) {
    const byTxn = await Order.findOne({ paystackTransactionId: txnId, paymentMethod: "paystack" });
    if (byTxn) return byTxn;
  }
  return null;
}

/**
 * Apply Paystack refund webhook events so dashboard/API refunds stay in sync without manual "Refund buyer" clicks.
 * Events: `refund.processed`, `refund.failed`, `refund.pending` (see Paystack webhook docs).
 */
export async function handlePaystackRefundWebhookEvent(event: string, rawData: unknown): Promise<void> {
  const data = rawData as RefundWebhookPayload;
  const refundId = coerceRefundId(data);
  const order = await findOrderForRefundWebhook(data);
  if (!order || order.paymentMethod !== "paystack") return;

  if (event === "refund.processed") {
    if (refundId != null && order.paystackRefundId == null) order.paystackRefundId = refundId;
    await applyProcessedPaystackRefundToOrder(order);
    await order.save();
    return;
  }

  if (event === "refund.failed") {
    if (refundId != null && order.paystackRefundId != null && order.paystackRefundId !== refundId) return;
    order.refundStatus = "requested";
    order.paystackRefundId = null;
    order.paystackRefundRemoteStatus = "";
    await order.save();
    return;
  }

  if (event === "refund.pending") {
    if (order.refundStatus === "refunded" && order.paystackRefundRemoteStatus === "processed") return;
    if (refundId != null) order.paystackRefundId = refundId;
    const st = String(data.status || "pending").toLowerCase();
    order.paystackRefundRemoteStatus = st;
    if (order.refundStatus === "none" || order.refundStatus === "requested") {
      order.refundStatus = "refund_processing";
    }
    await order.save();
  }
}
