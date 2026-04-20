import type { Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { Order } from "../orders/order.model";
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

export const listProductReviews = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const rows = await Review.find({ productId: id }).sort({ createdAt: -1 }).limit(100).lean();
  const byName = await reviewerDisplayNames(rows.map((r) => r.buyerId.toString()));
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    reviews: rows.map((r) => ({
      id: r._id.toString(),
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewerDisplayName: byName.get(r.buyerId.toString()) || "Verified buyer"
    }))
  });
});

/** Whether the logged-in shopper may submit a review for this product (verified purchase, not duplicate). */
export const getReviewStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const product = await Product.findById(id).select("_id status").lean();
  if (!product || product.status !== "active") throw new HttpError(404, "Product not found");

  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const productOid = new mongoose.Types.ObjectId(id);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const existing = await Review.findOne({ productId: id, buyerId }).lean();
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

  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const productOid = new mongoose.Types.ObjectId(id);

  let orderOid: mongoose.Types.ObjectId | null = null;
  if (env.REVIEWS_SKIP_VERIFIED_PURCHASE && !orderId) {
    orderOid = null;
  } else {
    if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");
    const order = await Order.findOne({
      _id: orderId,
      buyerId,
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
      buyerId,
      orderId: orderOid,
      rating,
      comment: comment || ""
    });
    res.status(201).json({
      review: {
        id: rev._id.toString(),
        productId: rev.productId.toString(),
        buyerId: rev.buyerId.toString(),
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
