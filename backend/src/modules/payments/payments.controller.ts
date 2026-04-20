import type { Request, Response } from "express";
import mongoose from "mongoose";
import Stripe from "stripe";
import { env } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { Order } from "../orders/order.model";
import { Product } from "../products/product.model";

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

export const createCheckoutSession = asyncHandler(async (req: Request, res: Response) => {
  if (!stripe) throw new HttpError(503, "Stripe not configured");

  const { orderId } = req.body as { orderId: string };
  if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");

  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.buyerId.toString() !== req.user!.id) throw new HttpError(403, "Forbidden");
  if (order.status !== "pending_payment") throw new HttpError(400, "Order is not payable");

  const currency = (order.currency || "ghs").toLowerCase();
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map((it) => ({
    price_data: {
      currency,
      product_data: { name: it.name },
      unit_amount: Math.round(it.unitPrice * 100)
    },
    quantity: it.quantity
  }));

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
        { $set: { status: "paid", stripeCheckoutSessionId: session.id } },
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
    }
  }

  res.json({ received: true });
});
