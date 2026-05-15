import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { env, isPaystackMoneyRailEnabled } from "../../config/env";
import { getEffectiveCommissionPercent } from "../platform/platformSettings.service";
import { buyerTotalForMerchantNetGhs, roundMoney, serviceFeeOnVendorGross } from "../../utils/commission";
import { Order } from "./order.model";
import { Product } from "../products/product.model";
import { withContacts } from "./orderSerialize";
import { notifyOrderCancelledForCounterparties, notifyOrderMessageRecipients, notifySellersNewOrder, notifySellersPaymentSubmitted } from "../notifications/notification.service";

type InboxMsg = { senderRole: string; text: string; createdAt: Date; senderId: mongoose.Types.ObjectId | string };

export const checkout = asyncHandler(async (req: Request, res: Response) => {
  const { items } = req.body as {
    items: { productId: string; quantity: number; customization?: string }[];
  };
  const buyerId = new mongoose.Types.ObjectId(req.user!.id);

  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    sellerId: mongoose.Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
    platformFee: number;
    sellerProceeds: number;
  }> = [];

  const commissionPct = await getEffectiveCommissionPercent();
  for (const row of items) {
    if (!mongoose.isValidObjectId(row.productId)) throw new HttpError(400, "Invalid product id");
    const p = await Product.findById(row.productId);
    if (!p || p.status !== "active") throw new HttpError(400, `Product unavailable: ${row.productId}`);
    if (p.category === "services") {
      throw new HttpError(
        400,
        "Service listings are quoted with vendors directly. Remove them from your cart — open the listing and use seller contact details."
      );
    }
    if (p.category === "food_drinks") {
      throw new HttpError(
        400,
        "Food & drink items are priced on request. Remove them from your cart — call or message the vendor from the listing to order."
      );
    }
    if (!(Number(p.price) > 0)) {
      throw new HttpError(400, `Listing has no checkout price: ${p.name}`);
    }
    if (p.stock < row.quantity) throw new HttpError(400, `Insufficient stock for ${p.name}`);

    const vendorGross = roundMoney(p.price * row.quantity);
    const platformFee = serviceFeeOnVendorGross(vendorGross, commissionPct);
    const sellerProceeds = vendorGross;
    const note = typeof row.customization === "string" ? row.customization.trim().slice(0, 280) : "";
    lineItems.push({
      productId: p._id,
      sellerId: p.sellerId,
      name: p.name,
      quantity: row.quantity,
      unitPrice: p.price,
      platformFee,
      sellerProceeds,
      ...(note ? { buyerNote: note } : {})
    });
  }

  const subtotal = roundMoney(lineItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0));
  const serviceFeeTotal = roundMoney(lineItems.reduce((s, it) => s + it.platformFee, 0));
  const baseBeforeProcessing = roundMoney(subtotal + serviceFeeTotal);
  const total = buyerTotalForMerchantNetGhs(
    baseBeforeProcessing,
    env.PAYSTACK_CHECKOUT_FEE_PERCENT,
    env.PAYSTACK_CHECKOUT_FEE_FIXED_GHS
  );
  const processingFeeTotal = roundMoney(total - baseBeforeProcessing);

  const order = await Order.create({
    buyerId,
    items: lineItems,
    currency: "ghs",
    subtotal,
    total,
    pricingVersion: 2,
    processingFeeTotal,
    status: "pending_payment"
  });

  void notifySellersNewOrder(order._id.toString());

  const [orderOut] = await withContacts([order.toObject() as unknown as Record<string, unknown>]);
  res.status(201).json({ order: orderOut });
});

export const listMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const rows =
    req.user!.role === "admin"
      ? await Order.find({}).sort({ createdAt: -1 }).limit(200).lean()
      : await Order.find({ buyerId: new mongoose.Types.ObjectId(req.user!.id) }).sort({ createdAt: -1 }).lean();
  const orders = await withContacts(rows as unknown as Record<string, unknown>[]);
  res.json({ orders });
});

/** Buyer inbox: orders where at least one message was sent by a seller (vendor). */
export const listBuyerVendorInbox = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== "buyer" && req.user!.role !== "admin") {
    throw new HttpError(403, "This inbox is for buyer accounts");
  }
  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await Order.find({ buyerId }).sort({ updatedAt: -1 }).limit(80).lean();
  const serialized = await withContacts(rows as unknown as Record<string, unknown>[]);

  const threads = serialized
    .map((o) => {
      const all = ((o.messages as InboxMsg[]) || []).slice();
      const hasVendor = all.some((m) => m.senderRole === "seller");
      if (!hasVendor) return null;
      const sellerContacts = (o.sellerContacts as Array<{ id: string; displayName: string }>) || [];
      const sellersById = new Map(sellerContacts.map((s) => [s.id, (s.displayName || "").trim() || "Seller"]));
      all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return {
        orderId: o.id,
        status: o.status,
        total: o.total,
        itemSummary: ((o.items as Array<{ name: string }>) || [])
          .slice(0, 4)
          .map((it) => it.name)
          .join(" · "),
        updatedAt: o.updatedAt,
        messages: all.map((m) => ({
          senderRole: m.senderRole,
          text: m.text,
          createdAt: m.createdAt,
          senderLabel:
            m.senderRole === "seller" ? sellersById.get(String(m.senderId)) || "Seller" : "You"
        }))
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ threads });
});

/** Seller inbox: one thread per order you’re on (non-cancelled), so you can message each buyer separately even before they write first. */
export const listSellerBuyerInbox = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== "seller" && req.user!.role !== "admin") {
    throw new HttpError(403, "This inbox is for seller accounts");
  }
  const sid = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await Order.find({ "items.sellerId": sid }).sort({ updatedAt: -1 }).limit(80).lean();
  const serialized = await withContacts(rows as unknown as Record<string, unknown>[]);

  const threads = serialized
    .map((o) => {
      if (o.status === "cancelled") return null;
      const all = ((o.messages as InboxMsg[]) || []).slice();
      const buyerContact = (o.buyerContact as { displayName?: string }) || {};
      const buyerLabel = (buyerContact.displayName || "").trim() || "Buyer";
      all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return {
        orderId: o.id,
        status: o.status,
        total: o.total,
        itemSummary: ((o.items as Array<{ name: string }>) || [])
          .slice(0, 4)
          .map((it) => it.name)
          .join(" · "),
        buyerDisplayName: buyerLabel,
        updatedAt: o.updatedAt,
        messages: all.map((m) => ({
          senderRole: m.senderRole,
          text: m.text,
          createdAt: m.createdAt,
          senderLabel: m.senderRole === "buyer" ? buyerLabel : "You"
        }))
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ threads });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  const o = await Order.findById(id).lean();
  if (!o) throw new HttpError(404, "Order not found");

  const uid = req.user!.id;
  if (o.buyerId.toString() === uid || req.user!.role === "admin") {
    const [order] = await withContacts([o as unknown as Record<string, unknown>]);
    return res.json({ order });
  }
  const isSeller = (o.items as Array<{ sellerId: mongoose.Types.ObjectId }>).some((it) => it.sellerId.toString() === uid);
  if (req.user!.role === "seller" && isSeller) {
    const [order] = await withContacts([o as unknown as Record<string, unknown>]);
    return res.json({ order });
  }
  throw new HttpError(403, "Forbidden");
});

export const addOrderMessage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { text } = req.body as { text: string };
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  const order = await Order.findById(id);
  if (!order) throw new HttpError(404, "Order not found");

  const uid = req.user!.id;
  const isBuyer = order.buyerId.toString() === uid;
  const isSeller = order.items.some((it) => it.sellerId.toString() === uid);
  if (!isBuyer && !isSeller) throw new HttpError(403, "Forbidden");

  order.messages.push({
    senderId: new mongoose.Types.ObjectId(uid),
    senderRole: isBuyer ? "buyer" : "seller",
    text: text.trim(),
    createdAt: new Date()
  });
  await order.save();
  void notifyOrderMessageRecipients(id, isBuyer);
  const [serialized] = await withContacts([order.toObject() as unknown as Record<string, unknown>]);
  res.json({ order: serialized });
});

/**
 * Hard delete: buyers may remove only their own `cancelled` orders. Sellers on an order may
 * remove `pending_payment` (abandoned checkout) or `cancelled` without a separate cancel step.
 * Admins: same as buyers on this route (`cancelled` only); other admin tools may apply elsewhere.
 */
export const deleteMyOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  const order = await Order.findById(id);
  if (!order) throw new HttpError(404, "Order not found");
  const uid = req.user!.id;
  const isBuyer = order.buyerId.toString() === uid;
  const isAdmin = req.user!.role === "admin";
  const sid = new mongoose.Types.ObjectId(uid);
  const sellerTouchesLine = order.items.some((it) => it.sellerId.equals(sid));
  const isOrderSeller = req.user!.role === "seller" && sellerTouchesLine;
  if (!isBuyer && !isAdmin && !isOrderSeller) {
    throw new HttpError(403, "Forbidden");
  }

  if (isOrderSeller && !isAdmin) {
    if (!["pending_payment", "cancelled"].includes(order.status)) {
      throw new HttpError(
        400,
        "Only pending payment or cancelled orders can be deleted. This order is still active."
      );
    }
  } else if (isBuyer) {
    if (order.status !== "cancelled") {
      throw new HttpError(400, "Only cancelled orders can be removed. Cancel the order first if needed.");
    }
  } else if (isAdmin) {
    if (order.status !== "cancelled") {
      throw new HttpError(400, "Only cancelled orders can be removed from this endpoint.");
    }
  }

  await order.deleteOne();
  res.status(204).send();
});

/**
 * Buyer-initiated cancellation. Allowed only while no vendor has acted on the order:
 *   - `pending_payment`         — buyer never submitted off-platform details
 *   - `awaiting_vendor_payment` — buyer submitted MoMo/bank details, but no seller has confirmed receipt yet
 * Once any seller confirms (status becomes `paid` and stock is reduced), the buyer must work with
 * the seller / admin to resolve. Vendor-side cancel still uses `updateVendorOrderStatus`.
 */
export const cancelMyOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  const order = await Order.findById(id);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.buyerId.toString() !== req.user!.id) throw new HttpError(403, "Forbidden");

  if (!["pending_payment", "awaiting_vendor_payment"].includes(order.status)) {
    throw new HttpError(
      400,
      order.status === "cancelled"
        ? "This order is already cancelled"
        : "This order can no longer be cancelled — please contact the seller or open a report"
    );
  }

  const reason = typeof (req.body as { reason?: unknown })?.reason === "string"
    ? String((req.body as { reason: string }).reason).trim().slice(0, 500)
    : "";

  order.status = "cancelled";
  order.confirmedSellerIds = [];
  if (reason) {
    order.messages.push({
      senderId: new mongoose.Types.ObjectId(req.user!.id),
      senderRole: "buyer",
      text: `Order cancelled by buyer. Reason: ${reason}`,
      createdAt: new Date()
    });
  } else {
    order.messages.push({
      senderId: new mongoose.Types.ObjectId(req.user!.id),
      senderRole: "buyer",
      text: "Order cancelled by buyer.",
      createdAt: new Date()
    });
  }
  await order.save();

  void notifyOrderCancelledForCounterparties(id, "buyer");

  const [serialized] = await withContacts([order.toObject() as unknown as Record<string, unknown>]);
  res.json({ order: serialized });
});

const AMOUNT_EPS = 0.02;

export const markManualPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as
    | { method: "momo"; momoPhone: string; momoAmount: number; reference?: string }
    | {
        method: "bank";
        cardholderName: string;
        cardNumber: string;
        cardExpiry: string;
        cvv: string;
        reference?: string;
      };
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  const order = await Order.findById(id);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.buyerId.toString() !== req.user!.id) throw new HttpError(403, "Forbidden");
  if (order.status !== "pending_payment") throw new HttpError(400, "Order is not payable");

  if (isPaystackMoneyRailEnabled()) {
    throw new HttpError(
      400,
      "All payments on this marketplace go through Paystack. Open Pay now from checkout to pay with card or Ghana mobile money on Paystack."
    );
  }

  const reference = "reference" in body && body.reference ? String(body.reference).trim() : "";

  if (body.method === "momo") {
    if (Math.abs(Number(body.momoAmount) - order.total) > AMOUNT_EPS) {
      throw new HttpError(400, "MoMo amount must match the order total");
    }
    order.paymentDetails = {
      momoPhone: body.momoPhone.trim(),
      momoAmount: Number(body.momoAmount)
    };
  } else {
    const digits = body.cardNumber.replace(/\D/g, "");
    const cardLast4 = digits.slice(-4);
    order.paymentDetails = {
      cardLast4,
      cardholderName: body.cardholderName.trim(),
      cardExpiry: body.cardExpiry.trim()
    };
  }

  /** Off-platform payments: wait for vendor(s) to confirm funds received before `paid` and stock movement. */
  order.status = "awaiting_vendor_payment";
  order.confirmedSellerIds = [];
  order.paymentMethod = body.method;
  order.paymentReference = reference || null;
  await order.save();

  void notifySellersPaymentSubmitted(order._id.toString());

  const [serialized] = await withContacts([order.toObject() as unknown as Record<string, unknown>]);
  res.json({ order: serialized });
});
