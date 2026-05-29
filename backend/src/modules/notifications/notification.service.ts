import mongoose from "mongoose";
import { Order } from "../orders/order.model";
import { ProductSave } from "../products/productSave.model";
import { Notification, type NotificationType } from "./notification.model";

type FirePayload = {
  type: NotificationType;
  title: string;
  message: string;
  orderId?: mongoose.Types.ObjectId | null;
};

async function persist(userId: mongoose.Types.ObjectId, doc: FirePayload): Promise<void> {
  try {
    await Notification.create({
      userId,
      type: doc.type,
      title: doc.title.trim().slice(0, 200),
      message: doc.message.trim().slice(0, 2000),
      orderId: doc.orderId ?? null,
      read: false
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[notifications] could not persist notification:", err);
  }
}

/** Low-level helper: create one in-app notification for a user (best-effort; callers typically `void` it). */
export function fireNotification(userId: mongoose.Types.ObjectId, payload: FirePayload): void {
  void persist(userId, payload);
}

type OrderParties = {
  buyerId: mongoose.Types.ObjectId;
  sellerIds: mongoose.Types.ObjectId[];
};

async function partiesForOrder(orderId: string): Promise<OrderParties | null> {
  if (!mongoose.isValidObjectId(orderId)) return null;
  const o = await Order.findById(orderId).select("buyerId items").lean();
  if (!o) return null;
  const buyerId = (o as { buyerId: mongoose.Types.ObjectId }).buyerId;
  const items = ((o as { items?: Array<{ sellerId: mongoose.Types.ObjectId }> }).items || []) as Array<{
    sellerId: mongoose.Types.ObjectId;
  }>;
  const seen = new Set<string>();
  const sellerIds: mongoose.Types.ObjectId[] = [];
  for (const it of items) {
    const s = String(it.sellerId);
    if (!seen.has(s)) {
      seen.add(s);
      sellerIds.push(it.sellerId);
    }
  }
  return { buyerId, sellerIds };
}

export function notifySellersNewOrder(orderIdStr: string): void {
  void (async () => {
    const p = await partiesForOrder(orderIdStr);
    if (!p?.sellerIds.length) return;
    const oid = new mongoose.Types.ObjectId(orderIdStr);
    for (const sid of p.sellerIds) {
      await persist(sid, {
        type: "order_placed",
        title: "New order",
        message: "You have a new order waiting for payment or fulfilment.",
        orderId: oid
      });
    }
  })();
}

export function notifySellersPaymentSubmitted(orderIdStr: string): void {
  void (async () => {
    const p = await partiesForOrder(orderIdStr);
    if (!p?.sellerIds.length) return;
    const oid = new mongoose.Types.ObjectId(orderIdStr);
    for (const sid of p.sellerIds) {
      await persist(sid, {
        type: "payment_submitted",
        title: "Buyer submitted payment",
        message: "A buyer submitted off-platform payment details. Confirm receipt when funds land.",
        orderId: oid
      });
    }
  })();
}

export function notifyOrderPaid(orderIdStr: string): void {
  void (async () => {
    const p = await partiesForOrder(orderIdStr);
    if (!p) return;
    const oid = new mongoose.Types.ObjectId(orderIdStr);
    await persist(p.buyerId, {
      type: "payment_received",
      title: "Payment confirmed",
      message: "Your order payment is confirmed.",
      orderId: oid
    });
    for (const sid of p.sellerIds) {
      await persist(sid, {
        type: "payment_received",
        title: "Order paid",
        message: "An order affecting your listings is now paid.",
        orderId: oid
      });
    }
  })();
}

export function notifyBuyerRefundProcessed(orderIdStr: string, buyerId: mongoose.Types.ObjectId): void {
  const oid = mongoose.isValidObjectId(orderIdStr) ? new mongoose.Types.ObjectId(orderIdStr) : null;
  fireNotification(buyerId, {
    type: "refund_processed",
    title: "Refund completed",
    message: "Your refund has been processed to your payment method.",
    orderId: oid
  });
}

/** Saved-item watchers (logged-in `u:<id>` keys only) when an active listing price decreases. */
export function notifySaversPriceDrop(args: {
  productId: mongoose.Types.ObjectId;
  oldPrice: number;
  newPrice: number;
  productName: string;
}): void {
  if (!(args.newPrice < args.oldPrice)) return;
  const denom = args.oldPrice > 0 ? args.oldPrice : 1;
  const dropPct = Math.max(1, Math.round(((args.oldPrice - args.newPrice) / denom) * 100));
  void (async () => {
    const saves = await ProductSave.find({ productId: args.productId }).select("ownerKey").lean();
    const seen = new Set<string>();
    const title = dropPct >= 5 ? "Price dropped" : "Price updated";
    const shortName = String(args.productName || "Saved item").trim().slice(0, 90);
    const msg = `${shortName} — now ₵${args.newPrice.toFixed(2)} (${dropPct}% off list).`;
    for (const row of saves) {
      const key = String((row as { ownerKey?: string }).ownerKey || "");
      if (!key.startsWith("u:")) continue;
      const uid = key.slice(2);
      if (!mongoose.isValidObjectId(uid) || seen.has(uid)) continue;
      seen.add(uid);
      fireNotification(new mongoose.Types.ObjectId(uid), {
        type: "price_drop",
        title,
        message: msg
      });
    }
  })();
}

/** In-app ping for users who saved a product when an admin-approved flash / deal goes live. */
export function notifySaversDealLive(args: {
  productId: mongoose.Types.ObjectId;
  productName: string;
  salePrice: number;
  wasPrice: number;
  endsAt: Date;
  vendorLabel: string;
}): void {
  void (async () => {
    const saves = await ProductSave.find({ productId: args.productId }).select("ownerKey").lean();
    const seen = new Set<string>();
    const shortName = String(args.productName || "Saved item").trim().slice(0, 90);
    const vendor = String(args.vendorLabel || "A shop").trim().slice(0, 50);
    const endStr = args.endsAt.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    const msg = `🔥 ${vendor} — ${shortName} now ₵${args.salePrice.toFixed(2)} (was ₵${args.wasPrice.toFixed(2)}). Hurry — ends ${endStr}.`;
    for (const row of saves) {
      const key = String((row as { ownerKey?: string }).ownerKey || "");
      if (!key.startsWith("u:")) continue;
      const uid = key.slice(2);
      if (!mongoose.isValidObjectId(uid) || seen.has(uid)) continue;
      seen.add(uid);
      fireNotification(new mongoose.Types.ObjectId(uid), {
        type: "deal_live",
        title: "Deal on a saved item",
        message: msg
      });
    }
  })();
}

export function notifyBuyerOrderStatus(orderIdStr: string, buyerId: mongoose.Types.ObjectId, label: string): void {
  const oid = mongoose.isValidObjectId(orderIdStr) ? new mongoose.Types.ObjectId(orderIdStr) : null;
  fireNotification(buyerId, {
    type: "order_status_change",
    title: `Order: ${label}`,
    message: `Your order status is now «${label}».`,
    orderId: oid
  });
}

function toObjectId(id: mongoose.Types.ObjectId | string): mongoose.Types.ObjectId {
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);
}

/**
 * Buyer cancellation: notifies each seller on the order.
 * Seller cancellation: notifies the buyer and any other sellers (not the cancelling seller).
 */
export function notifyOrderCancelledForCounterparties(
  orderIdStr: string,
  actor: "buyer" | "seller",
  actorSellerId?: mongoose.Types.ObjectId | string
): void {
  void (async () => {
    const p = await partiesForOrder(orderIdStr);
    if (!p) return;
    const oid = new mongoose.Types.ObjectId(orderIdStr);
    const actorSid = actorSellerId != null ? toObjectId(actorSellerId) : undefined;

    if (actor === "buyer") {
      const msg =
        "A buyer cancelled an order affecting your listings. No action is needed if funds were never received.";
      for (const sid of p.sellerIds) {
        await persist(sid, {
          type: "order_cancelled",
          title: "Order cancelled",
          message: msg,
          orderId: oid
        });
      }
      return;
    }

    await persist(p.buyerId, {
      type: "order_cancelled",
      title: "Order cancelled",
      message: "A seller cancelled this order. Contact the seller if you already paid.",
      orderId: oid
    });

    for (const sid of p.sellerIds) {
      if (actorSid && sid.equals(actorSid)) continue;
      await persist(sid, {
        type: "order_cancelled",
        title: "Order cancelled",
        message: "An order affecting your listings was cancelled by another party.",
        orderId: oid
      });
    }
  })();
}

/** After an order-thread message: notify the counterpart (all sellers if buyer wrote, buyer if seller wrote). */
export function notifyOrderMessageRecipients(orderIdStr: string, senderWasBuyer: boolean): void {
  void (async () => {
    const p = await partiesForOrder(orderIdStr);
    if (!p) return;
    const oid = new mongoose.Types.ObjectId(orderIdStr);
    if (senderWasBuyer) {
      for (const sid of p.sellerIds) {
        await persist(sid, {
          type: "message_received",
          title: "New order message",
          message: "The buyer sent a message on an order.",
          orderId: oid
        });
      }
      return;
    }
    await persist(p.buyerId, {
      type: "message_received",
      title: "New order message",
      message: "A seller sent a message on your order.",
      orderId: oid
    });
  })();
}
