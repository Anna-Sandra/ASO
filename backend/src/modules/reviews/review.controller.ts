import type { Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { Order } from "../orders/order.model";
import { canActAsOrderBuyer, readGuestSecretFromRequest } from "../orders/orderAccess";
import { Product } from "../products/product.model";
import { Review } from "./review.model";

const ELIGIBLE_ORDER_STATUSES = ["paid", "processing", "sent_for_delivery", "delivered"] as const;

function lineIncludesProduct(
  items: Array<{ productId: mongoose.Types.ObjectId }>,
  productObjectId: mongoose.Types.ObjectId
) {
  return items.some((it) => it.productId.equals(productObjectId));
}

async function reviewerDisplayNames(buyerIds: string[]) {
  if (!buyerIds.length) return new Map<string, string>();
  const users = await User.find({
    _id: { $in: buyerIds.map((x) => new mongoose.Types.ObjectId(x)) }
  })
    .select("displayName")
    .lean();
  return new Map(
    users.map((u) => {
      const name = (u.displayName || "").trim();
      return [u._id.toString(), name || "Verified buyer"];
    })
  );
}

function guestDisplayNameForEmail(email: string): string {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return "Guest buyer";
  const local = (e.split("@")[0] || "").trim();
  if (!local) return "Guest buyer";
  const safe = local.replace(/[^a-z0-9._-]/gi, "");
  return safe ? `Guest (${safe.slice(0, 18)})` : "Guest buyer";
}

export const listProductReviews = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const product = await Product.findById(id).select("status").lean();
  if (!product || product.status !== "active") throw new HttpError(404, "Product not found");
  const productOid = new mongoose.Types.ObjectId(id);
  const rows = await Review.find({ productId: productOid }).sort({ createdAt: -1 }).limit(100).lean();
  const buyerIds = rows
    .map((r) => (r.buyerId instanceof mongoose.Types.ObjectId ? r.buyerId.toString() : ""))
    .filter(Boolean);
  const byName = await reviewerDisplayNames(buyerIds);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    reviews: rows.map((r) => ({
      id: r._id.toString(),
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewerDisplayName:
        r.buyerId instanceof mongoose.Types.ObjectId
          ? byName.get(r.buyerId.toString()) || "Verified buyer"
          : guestDisplayNameForEmail(String(r.guestEmail || ""))
    }))
  });
});

/** Whether the logged-in shopper may submit a review for this product (verified purchase, not duplicate). */
export const getReviewStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const product = await Product.findById(id).select("_id status").lean();
  if (!product || product.status !== "active") throw new HttpError(404, "Product not found");

  const productOid = new mongoose.Types.ObjectId(id);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const uid = req.user?.id && mongoose.isValidObjectId(req.user.id) ? req.user.id : "";
  const isGuestFlow = !uid;
  const buyerId = uid ? new mongoose.Types.ObjectId(uid) : null;

  if (env.REVIEWS_SKIP_VERIFIED_PURCHASE) {
    res.json({
      canSubmit: true,
      hasReview: false,
      orderId: null as string | null,
      skipVerifiedPurchase: true as const
    });
    return;
  }

  const orderIdHint =
    typeof req.query.orderId === "string" && req.query.orderId.trim() ? req.query.orderId.trim() : "";

  if (isGuestFlow) {
    if (!mongoose.isValidObjectId(orderIdHint)) {
      res.json({ canSubmit: false, hasReview: false, reason: "purchase_required" as const });
      return;
    }
    const guestOrder = await Order.findById(orderIdHint).select("+guestAccessSecret");
    if (!guestOrder) throw new HttpError(404, "Order not found");
    const guestSecret = readGuestSecretFromRequest(req);
    if (!canActAsOrderBuyer(req, guestOrder.toObject(), guestSecret)) {
      throw new HttpError(403, "Forbidden");
    }
    if (guestOrder.buyerId) {
      res.json({ canSubmit: false, hasReview: false, reason: "purchase_required" as const });
      return;
    }
    if (!ELIGIBLE_ORDER_STATUSES.includes(guestOrder.status as (typeof ELIGIBLE_ORDER_STATUSES)[number])) {
      res.json({ canSubmit: false, hasReview: false, reason: "purchase_required" as const });
      return;
    }
    if (!lineIncludesProduct(guestOrder.items as Array<{ productId: mongoose.Types.ObjectId }>, productOid)) {
      res.json({ canSubmit: false, hasReview: false, reason: "order_not_eligible" as const });
      return;
    }
    const existingGuest = await Review.findOne({ productId: productOid, orderId: guestOrder._id }).lean();
    if (existingGuest) {
      res.json({
        canSubmit: false,
        hasReview: true,
        review: {
          id: existingGuest._id.toString(),
          rating: existingGuest.rating,
          comment: existingGuest.comment,
          createdAt: existingGuest.createdAt
        }
      });
      return;
    }
    res.json({ canSubmit: true, hasReview: false, orderId: guestOrder._id.toString(), guest: true as const });
    return;
  }

  const existing = await Review.findOne({ productId: productOid, buyerId }).lean();
  if (existing) {
    res.json({
      canSubmit: false,
      hasReview: true,
      review: {
        id: existing._id.toString(),
        rating: existing.rating,
        comment: existing.comment,
        createdAt: existing.createdAt
      }
    });
    return;
  }

  if (orderIdHint && mongoose.isValidObjectId(orderIdHint)) {
    const pinned = await Order.findOne({
      _id: new mongoose.Types.ObjectId(orderIdHint),
      buyerId,
      status: { $in: [...ELIGIBLE_ORDER_STATUSES] },
      items: { $elemMatch: { productId: productOid } }
    })
      .select("_id items")
      .lean();
    if (pinned && lineIncludesProduct(pinned.items as Array<{ productId: mongoose.Types.ObjectId }>, productOid)) {
      res.json({
        canSubmit: true,
        hasReview: false,
        orderId: pinned._id.toString()
      });
      return;
    }
    res.json({
      canSubmit: false,
      hasReview: false,
      reason: "order_not_eligible" as const
    });
    return;
  }

  const order = await Order.findOne({
    buyerId,
    status: { $in: [...ELIGIBLE_ORDER_STATUSES] },
    items: { $elemMatch: { productId: productOid } }
  })
    .sort({ createdAt: -1 })
    .select("_id items")
    .lean();

  if (!order || !lineIncludesProduct(order.items as Array<{ productId: mongoose.Types.ObjectId }>, productOid)) {
    res.json({
      canSubmit: false,
      hasReview: false,
      reason: "purchase_required" as const
    });
    return;
  }

  res.json({
    canSubmit: true,
    hasReview: false,
    orderId: order._id.toString()
  });
});

export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const { rating, comment, orderId: orderIdRaw } = req.body as { rating: number; comment: string; orderId?: string };
  const orderId = String(orderIdRaw || "").trim();

  const product = await Product.findById(id);
  if (!product || product.status !== "active") throw new HttpError(404, "Product not found");

  const productOid = new mongoose.Types.ObjectId(id);
  const uid = req.user?.id && mongoose.isValidObjectId(req.user.id) ? req.user.id : "";
  const buyerId = uid ? new mongoose.Types.ObjectId(uid) : null;

  let orderOid: mongoose.Types.ObjectId | null = null;
  let guestEmail = "";
  let guestDisplayName = "";
  if (env.REVIEWS_SKIP_VERIFIED_PURCHASE && !orderId) {
    orderOid = null;
  } else {
    if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");
    const baseOrder = await Order.findById(orderId).select("+guestAccessSecret");
    if (!baseOrder) throw new HttpError(400, "Order not found or not eligible for review");
    const isGuestOrder = !baseOrder.buyerId;
    if (isGuestOrder) {
      const guestSecret = readGuestSecretFromRequest(req);
      if (!canActAsOrderBuyer(req, baseOrder.toObject(), guestSecret)) throw new HttpError(403, "Forbidden");
      const gc = (baseOrder.guestContact?.email || "").trim().toLowerCase();
      if (!gc.includes("@")) throw new HttpError(400, "Guest order missing contact email");
      guestEmail = gc;
      guestDisplayName = guestDisplayNameForEmail(gc);
    } else {
      if (!buyerId || baseOrder.buyerId?.toString() !== buyerId.toString()) {
        throw new HttpError(403, "Forbidden");
      }
    }
    const order = await Order.findOne({
      _id: baseOrder._id,
      status: { $in: [...ELIGIBLE_ORDER_STATUSES] }
    });
    if (!order) throw new HttpError(400, "Order not found or not eligible for review");
    if (!lineIncludesProduct(order.items, productOid)) throw new HttpError(400, "Product not in this order");
    orderOid = new mongoose.Types.ObjectId(orderId);
  }

  try {
    const rev = await Review.create({
      productId: product._id,
      sellerId: product.sellerId,
      ...(buyerId ? { buyerId } : {}),
      ...(guestEmail ? { guestEmail, guestDisplayName } : {}),
      orderId: orderOid,
      rating,
      comment: comment || ""
    });
    res.status(201).json({
      review: {
        id: rev._id.toString(),
        productId: rev.productId.toString(),
        buyerId: rev.buyerId ? rev.buyerId.toString() : null,
        rating: rev.rating,
        comment: rev.comment,
        createdAt: rev.createdAt
      }
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: number }).code === 11000) {
      throw new HttpError(409, "You already reviewed this product. Only one review per product is allowed.");
    }
    throw e;
  }
});
