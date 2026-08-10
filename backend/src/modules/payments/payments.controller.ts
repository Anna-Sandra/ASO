import crypto from "crypto";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import Stripe from "stripe";
import { env, isPaystackMoneyRailEnabled, isPaystackCheckoutSplitEnabled } from "../../config/env";
import { roundMoney } from "../../utils/commission";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { Order } from "../orders/order.model";
import type { OrderDoc } from "../orders/order.model";
import { canActAsOrderBuyer, readGuestSecretFromRequest } from "../orders/orderAccess";
import { Product } from "../products/product.model";
import { mirrorOrderStatusToDelivery } from "../deliveries/delivery.service";
import { getOrCreateSettings, getEffectiveCommissionPercent } from "../platform/platformSettings.service";
import { mergePaystackCheckoutSplitIntoInitializeBody } from "./paystackPayouts";
import { handlePaystackRefundWebhookEvent } from "./paystackRefundSync";
import { notifyOrderPaid } from "../notifications/notification.service";
import { paystackGet, paystackPost } from "./paystackClient";
import { finalizeVendorSubscriptionFromPaystack } from "../vendorSubscription/vendorSubscription.controller";
import { runLoyaltySettlementForPaidOrder } from "../orders/orderPaymentSideEffects";

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

type PaystackInitializeData = {
  authorization_url: string;
  reference: string;
  access_code: string;
};

async function commitPaystackInitialize(
  order: InstanceType<typeof Order>,
  email: string
): Promise<{ authorizationUrl: string; reference: string; access_code: string }> {
  const emailTrim = email.trim();
  if (!emailTrim) throw new HttpError(400, "Email required");

  const currency = (order.currency || "GHS").toUpperCase();
  const totalMajor = Math.ceil(Number(order.total) || 0);
  const amountSubunit = totalMajor * 100;
  if (!Number.isFinite(amountSubunit) || amountSubunit < 100) {
    throw new HttpError(400, "Order total is too small for online payment");
  }

  const callback_url = `${env.APP_ORIGIN}/payment/success?orderId=${order._id.toString()}`;

  const initBody: Record<string, unknown> = {
    email: emailTrim,
    amount: amountSubunit,
    currency,
    callback_url,
    metadata: { orderId: order._id.toString() }
  };
  order.paystackUsedCheckoutSplit = await mergePaystackCheckoutSplitIntoInitializeBody(
    initBody,
    amountSubunit,
    order.items.map((it) => ({ sellerId: it.sellerId, sellerProceeds: Number(it.sellerProceeds) || 0 }))
  );

  const data = await paystackPost<PaystackInitializeData>("/transaction/initialize", initBody);

  order.paymentMethod = "paystack";
  order.paystackReference = data.reference;
  order.paymentReference = data.reference;
  await order.save();

  return { authorizationUrl: data.authorization_url, reference: data.reference, access_code: data.access_code };
}

type PaystackVerifyData = {
  id?: number;
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  metadata?: { orderId?: string; type?: string; userId?: string };
};

type PaystackRefundCreateData = {
  id?: number;
  status?: string;
};

type PaystackRefundFetchData = {
  id?: number;
  status?: string;
};

/**
 * Full refund: verify charge is successful, then refund using Paystack’s numeric transaction id + currency
 * (required for reliable MoMo/GHS handling; reference-only refunds often fail or mis-route).
 */
export async function createPaystackRefund(
  transactionReference: string,
  options?: { currency?: string }
): Promise<{ id: number; status: string; paystackTransactionId: number }> {
  const ref = String(transactionReference || "").trim();
  if (!ref) throw new HttpError(400, "Missing Paystack transaction reference");

  const verified = await paystackGet<PaystackVerifyData>(`/transaction/verify/${encodeURIComponent(ref)}`);
  if (String(verified?.status) !== "success") {
    throw new HttpError(
      400,
      `Paystack reports this charge as "${String(verified?.status || "unknown")}". Only successful charges can be refunded (check Test vs Live key matches the charge).`
    );
  }

  const paystackTransactionId = Number(verified.id);
  if (!Number.isFinite(paystackTransactionId)) {
    throw new HttpError(502, "Paystack verify did not return a transaction id; cannot create refund.");
  }

  const cur = (options?.currency || verified.currency || "GHS").toString().toUpperCase();
  let data: PaystackRefundCreateData;
  try {
    data = await paystackPost<PaystackRefundCreateData>("/refund", {
      transaction: paystackTransactionId,
      currency: cur
    });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      const raw = err.message.trim();
      const low = raw.toLowerCase();
      if (low.includes("insufficient balance") && low.includes("refund")) {
        throw new HttpError(
          400,
          "Paystack could not start this refund because there is not enough available balance in your Paystack merchant account (charges can take time to settle before you can refund). Open the Paystack dashboard → check balance / settlements, add funds if needed, then try again. Paystack said: " +
            raw
        );
      }
      if (low.includes("insufficient balance")) {
        throw new HttpError(
          400,
          "Paystack reported insufficient balance for this operation. Check available balance and settlements in your Paystack dashboard, then try again. Paystack said: " +
            raw
        );
      }
    }
    throw err;
  }
  const id = Number(data.id);
  if (!Number.isFinite(id)) throw new HttpError(502, "Invalid Paystack refund response");
  return {
    id,
    status: String(data.status || "").toLowerCase(),
    paystackTransactionId
  };
}

export async function getPaystackRefundById(refundId: number): Promise<{ id: number; status: string }> {
  if (!Number.isFinite(refundId)) throw new HttpError(400, "Invalid refund id");
  const data = await paystackGet<PaystackRefundFetchData>(`/refund/${refundId}`);
  const id = Number(data.id);
  if (!Number.isFinite(id)) throw new HttpError(502, "Invalid Paystack refund response");
  return { id, status: String(data.status || "").toLowerCase() };
}

/**
 * Mark order paid + stock (idempotent for same reference). Used by webhook and verify API.
 * Returns `true` if the order is now in a state we applied or was already `paid` with this reference.
 */
export async function finalizePaystackSuccessIfValid(
  order: { _id: mongoose.Types.ObjectId; total: number; status: string; items: { productId: mongoose.Types.ObjectId; quantity: number }[] },
  reference: string,
  amountKobo: number,
  paystackTransactionId?: number | null
): Promise<boolean> {
  const expected = Math.ceil(Number(order.total) || 0) * 100;
  if (!Number.isFinite(amountKobo) || amountKobo !== expected) {
    return false;
  }
  const txnIdNum = paystackTransactionId != null ? Number(paystackTransactionId) : NaN;
  const txnSet = Number.isFinite(txnIdNum) ? { paystackTransactionId: txnIdNum } : {};
  if (order.status === "pending_payment") {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "pending_payment" },
      {
        $set: {
          status: "paid",
          paymentStatus: "held",
          paymentMethod: "paystack",
          paymentReference: reference,
          paystackReference: reference,
          ...txnSet
        }
      },
      { new: true }
    ).lean();

    if (updated?.items?.length) {
      for (const it of updated.items) {
        await Product.updateOne({ _id: it.productId }, { $inc: { stock: -it.quantity } });
      }
    }
    void notifyOrderPaid(order._id.toString());
    void runLoyaltySettlementForPaidOrder(order._id);
    const paidDoc = await Order.findById(order._id);
    if (paidDoc) await mirrorOrderStatusToDelivery(paidDoc);
    return true;
  }
  if (order.status === "paid") {
    const o = await Order.findById(order._id).select("paystackReference paymentReference paystackTransactionId").lean();
    const ref = (o as { paystackReference?: string; paymentReference?: string | null })?.paystackReference;
    if (ref === reference) {
      if (Number.isFinite(txnIdNum) && (o as { paystackTransactionId?: number | null }).paystackTransactionId == null) {
        await Order.updateOne({ _id: order._id }, { $set: { paystackTransactionId: txnIdNum } });
      }
      return true;
    }
  }
  return false;
}

/** Public: buyer UI pricing inputs. Fee fields are **operational estimates** for gross-up (env-tuned), not Paystack pre-auth quotes. */
export const getCheckoutPaymentOptions = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await getOrCreateSettings();
  const rail = isPaystackMoneyRailEnabled();
  const paystack = rail;
  const commissionPercent = await getEffectiveCommissionPercent();
  res.set("Cache-Control", "public, max-age=30");
  res.json({
    paystack,
    /** When true, API disables manual MoMo/bank payment submission and Stripe checkout — use Paystack only. */
    paystackOnly: rail,
    /** When true, Paystack initialize uses split payment to seller subaccounts (see vendor payout registration). */
    paystackCheckoutSplit: isPaystackCheckoutSplitEnabled(),
    momoEnabled: rail ? false : doc.momoEnabled,
    bankEnabled: rail ? false : doc.bankEnabled,
    commissionPercent,
    paystackFeePercent: env.PAYSTACK_CHECKOUT_FEE_PERCENT,
    paystackFeeFixedGhs: env.PAYSTACK_CHECKOUT_FEE_FIXED_GHS
  });
});

export const verifyPaystackForOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!env.PAYSTACK_SECRET_KEY?.trim()) throw new HttpError(503, "Paystack not configured");

  const { orderId, guestSecret } = req.body as { orderId: string; guestSecret?: string };
  if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");

  const order = await Order.findById(orderId).select("+guestAccessSecret");
  if (!order) throw new HttpError(404, "Order not found");
  if (!canActAsOrderBuyer(req, order.toObject() as OrderDoc, guestSecret)) throw new HttpError(403, "Forbidden");
  if (order.status !== "pending_payment") {
    if (order.status === "paid") {
      return res.json({ ok: true, status: "paid", message: "Order already paid" });
    }
    throw new HttpError(400, "This order is not waiting for online payment");
  }

  const reference = (order.paystackReference || order.paymentReference || "").toString().trim();
  if (!reference) {
    throw new HttpError(400, "No Paystack reference on this order. Start checkout again from Pay now.");
  }

  const data = await paystackGet<PaystackVerifyData>(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (String(data?.status) !== "success") {
    return res.json({ ok: false, status: data?.status || "unknown", message: "Payment not completed" });
  }

  const amountKobo = Number(data.amount);
  const txnId = Number(data.id);
  const ok = await finalizePaystackSuccessIfValid(
    {
      _id: order._id,
      total: order.total,
      status: order.status,
      items: order.items
    },
    String(data.reference || reference),
    amountKobo,
    Number.isFinite(txnId) ? txnId : undefined
  );

  if (!ok) {
    return res.json({ ok: false, message: "Could not match payment to order" });
  }

  res.json({ ok: true, status: "paid" });
});

export const initializePaystackTransaction = asyncHandler(async (req: Request, res: Response) => {
  if (!env.PAYSTACK_SECRET_KEY?.trim()) throw new HttpError(503, "Paystack not configured");

  const { orderId, guestSecret } = req.body as { orderId: string; guestSecret?: string };
  if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");

  const order = await Order.findById(orderId).select("+guestAccessSecret");
  if (!order) throw new HttpError(404, "Order not found");
  if (!canActAsOrderBuyer(req, order.toObject() as OrderDoc, guestSecret)) throw new HttpError(403, "Forbidden");
  if (order.status !== "pending_payment") throw new HttpError(400, "Order is not payable");

  let email = "";
  if (order.buyerId) {
    const buyer = await User.findById(order.buyerId).select("email").lean();
    email = (buyer?.email && String(buyer.email).trim()) || "";
  } else {
    email = String(order.guestContact?.email || "").trim();
  }
  if (!email) throw new HttpError(400, "An email address is required to pay with Paystack");

  const out = await commitPaystackInitialize(order, email);
  res.json({ authorizationUrl: out.authorizationUrl, reference: out.reference });
});

/** `POST /api/paystack/init` — same as the Paystack guide: `{ email, amount }` plus `orderId` to link the cart order. */
export const initPaystackGuide = asyncHandler(async (req: Request, res: Response) => {
  if (!env.PAYSTACK_SECRET_KEY?.trim()) throw new HttpError(503, "Paystack not configured");

  const { email, amount, orderId, guestSecret } = req.body as {
    email: string;
    amount: number;
    orderId: string;
    guestSecret?: string;
  };
  if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");

  const order = await Order.findById(orderId).select("+guestAccessSecret");
  if (!order) throw new HttpError(404, "Order not found");
  if (!canActAsOrderBuyer(req, order.toObject() as OrderDoc, guestSecret)) throw new HttpError(403, "Forbidden");
  if (order.status !== "pending_payment") throw new HttpError(400, "Order is not payable");

  const bodyEmail = String(email).trim().toLowerCase();
  let payEmail = "";
  if (order.buyerId) {
    const buyer = await User.findById(order.buyerId).select("email").lean();
    const accountEmail = String(buyer?.email || "").trim().toLowerCase();
    if (!accountEmail || bodyEmail !== accountEmail) {
      throw new HttpError(400, "Email must match your account email");
    }
    payEmail = String(buyer?.email || "").trim();
  } else {
    const guestEmail = String(order.guestContact?.email || "")
      .trim()
      .toLowerCase();
    if (!guestEmail || bodyEmail !== guestEmail) {
      throw new HttpError(400, "Email must match the email you entered for this guest checkout");
    }
    payEmail = String(order.guestContact?.email || "").trim();
  }

  const expected = Math.ceil(Number(order.total) || 0);
  const got = Math.ceil(Number(amount) || 0);
  if (expected !== got) {
    throw new HttpError(400, "Amount must match the order total");
  }

  const out = await commitPaystackInitialize(order, payEmail);
  res.json({
    authorization_url: out.authorizationUrl,
    reference: out.reference,
    access_code: out.access_code
  });
});

/** `GET /api/paystack/verify/:ref` — verify on the server; does not trust the client. */
export const verifyPaystackByReference = asyncHandler(async (req: Request, res: Response) => {
  if (!env.PAYSTACK_SECRET_KEY?.trim()) throw new HttpError(503, "Paystack not configured");

  const ref = String(req.params.ref || "").trim();
  if (!ref) throw new HttpError(400, "Missing reference");

  const order = await Order.findOne({
    $or: [{ paystackReference: ref }, { paymentReference: ref }]
  }).select("+guestAccessSecret");
  if (!order) throw new HttpError(404, "No order for this reference");

  if (!canActAsOrderBuyer(req, order.toObject() as OrderDoc)) throw new HttpError(403, "Forbidden");

  if (order.status === "paid") {
    return res.json({
      data: { status: "success", reference: ref },
      message: "Already paid"
    });
  }
  if (order.status !== "pending_payment") {
    throw new HttpError(400, "Order is not waiting for online payment");
  }

  const remote = await paystackGet<PaystackVerifyData>(`/transaction/verify/${encodeURIComponent(ref)}`);
  if (String(remote?.status) !== "success") {
    return res.json({ data: remote, message: "Payment not completed" });
  }
  const amountKobo = Number(remote.amount);
  const txnId = Number(remote.id);
  const ok = await finalizePaystackSuccessIfValid(
    {
      _id: order._id,
      total: order.total,
      status: order.status,
      items: order.items
    },
    String(remote.reference || ref),
    amountKobo,
    Number.isFinite(txnId) ? txnId : undefined
  );
  if (!ok) {
    return res.json({ data: { ...remote, status: "mismatch" }, message: "Could not match payment to order" });
  }
  return res.json({ data: { ...remote, status: "success" } });
});

export const paystackWebhook = asyncHandler(async (req: Request, res: Response) => {
  const key = env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new HttpError(503, "Paystack not configured");

  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : "";
  const hash = crypto.createHmac("sha512", key).update(raw).digest("hex");
  const sig = req.headers["x-paystack-signature"];
  if (!sig || Array.isArray(sig) || hash !== sig) {
    throw new HttpError(401, "Invalid Paystack signature");
  }

  let event: {
    event?: string;
    data?: { id?: number; reference?: string; amount?: number; status?: string; metadata?: { orderId?: string }; transaction?: { reference?: string; id?: number } };
  };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    throw new HttpError(400, "Invalid webhook JSON");
  }

  if (event.event === "charge.success" && event.data?.reference) {
    const reference = String(event.data.reference);
    const amount = Number(event.data.amount);
    const metaType = String((event.data.metadata as { type?: string } | undefined)?.type || "");
    const metaUserId = String((event.data.metadata as { userId?: string } | undefined)?.userId || "");

    if (metaType === "vendor_subscription") {
      await finalizeVendorSubscriptionFromPaystack(reference, amount, metaUserId || undefined);
      res.json({ received: true });
      return;
    }

    const metaOrderId = event.data.metadata?.orderId;

    const order =
      (await Order.findOne({ paystackReference: reference, status: "pending_payment" })) ||
      (metaOrderId && mongoose.isValidObjectId(metaOrderId)
        ? await Order.findOne({ _id: metaOrderId, status: "pending_payment" })
        : null);

    if (order) {
      const tid = Number(event.data?.id);
      await finalizePaystackSuccessIfValid(
        { _id: order._id, total: order.total, status: order.status, items: order.items },
        reference,
        amount,
        Number.isFinite(tid) ? tid : undefined
      );
    }
  }

  const ev = String(event.event || "");
  if (ev === "refund.processed" || ev === "refund.failed" || ev === "refund.pending") {
    await handlePaystackRefundWebhookEvent(ev, event.data ?? {});
  }

  res.json({ received: true });
});

export const createCheckoutSession = asyncHandler(async (req: Request, res: Response) => {
  if (isPaystackMoneyRailEnabled()) {
    throw new HttpError(
      400,
      "This marketplace uses Paystack for online payments. Use POST /api/paystack/init instead of Stripe."
    );
  }
  if (!stripe) throw new HttpError(503, "Stripe not configured");

  const { orderId } = req.body as { orderId: string };
  if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");

  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  if (!order.buyerId) throw new HttpError(400, "Guest orders must be paid with Paystack — Stripe checkout is not available.");
  if (order.buyerId.toString() !== req.user!.id) throw new HttpError(403, "Forbidden");
  if (order.status !== "pending_payment") throw new HttpError(400, "Order is not payable");

  const currency = (order.currency || "ghs").toLowerCase();
  const unitAmount = Math.round(roundMoney(Number(order.total)) * 100);
  if (!Number.isFinite(unitAmount) || unitAmount < 100) {
    throw new HttpError(400, "Order total is too small for Stripe checkout");
  }
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency,
        product_data: { name: "Order total (items + fees)" },
        unit_amount: unitAmount
      },
      quantity: 1
    }
  ];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items,
    metadata: { orderId: order._id.toString() },
    success_url: `${env.APP_ORIGIN}/payment/success?orderId=${order._id.toString()}`,
    cancel_url: `${env.APP_ORIGIN}/payment/cancel?orderId=${order._id.toString()}`
  });

  order.stripeCheckoutSessionId = session.id;
  await order.save();

  res.json({ id: session.id, url: session.url });
});

export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (!stripe) throw new HttpError(503, "Stripe not configured");
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, "Stripe webhook secret not configured");

  const signature = req.headers["stripe-signature"];
  if (!signature || Array.isArray(signature)) throw new HttpError(400, "Missing signature");

  const event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (orderId && mongoose.isValidObjectId(orderId)) {
      const updated = await Order.findOneAndUpdate(
        { _id: orderId, status: "pending_payment" },
        { $set: { status: "paid", paymentStatus: "held", stripeCheckoutSessionId: session.id } },
        { new: true }
      ).lean();

      if (updated?.items?.length) {
        for (const it of updated.items) {
          await Product.updateOne(
            { _id: it.productId },
            { $inc: { stock: -it.quantity } }
          );
        }
      }
      void notifyOrderPaid(orderId);
      void runLoyaltySettlementForPaidOrder(new mongoose.Types.ObjectId(orderId));
      const paidDoc = await Order.findById(orderId);
      if (paidDoc) await mirrorOrderStatusToDelivery(paidDoc);
    }
  }

  res.json({ received: true });
});
