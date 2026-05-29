import type { Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { resolveBusinessByKey } from "../businesses/business.controller";
import type { BusinessDoc } from "../businesses/business.model";
import { Order } from "../orders/order.model";
import { Product } from "../products/product.model";
import { BusinessReview } from "./businessReview.model";

const ELIGIBLE_ORDER_STATUSES = ["paid", "processing", "sent_for_delivery", "delivered"] as const;

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

/** Product counts as belonging to this storefront: linked by businessId, or legacy unlinked but same owner. */
function productTouchesBusiness(
  p: { businessId?: mongoose.Types.ObjectId | null; sellerId?: mongoose.Types.ObjectId },
  business: BusinessDoc
): boolean {
  const bid = business._id;
  if (p.businessId && p.businessId.equals(bid)) return true;
  if (!p.businessId && p.sellerId && p.sellerId.equals(business.ownerId)) return true;
  return false;
}

async function findOrderForStoreReview(
  buyerId: mongoose.Types.ObjectId,
  business: BusinessDoc,
  preferredOrderId?: string | null
): Promise<{ orderId: mongoose.Types.ObjectId } | null> {
  const tryOne = async (orderOid: mongoose.Types.ObjectId) => {
    const o = await Order.findOne({
      _id: orderOid,
      buyerId,
      status: { $in: [...ELIGIBLE_ORDER_STATUSES] }
    })
      .select("items")
      .lean();
    if (!o?.items?.length) return null;
    const ids = o.items.map((it) => it.productId);
    const prods = await Product.find({ _id: { $in: ids } })
      .select("businessId sellerId")
      .lean();
    const ok = prods.some((p) => productTouchesBusiness(p as { businessId?: mongoose.Types.ObjectId | null; sellerId?: mongoose.Types.ObjectId }, business));
    return ok ? { orderId: orderOid } : null;
  };

  if (preferredOrderId && mongoose.isValidObjectId(preferredOrderId)) {
    const hit = await tryOne(new mongoose.Types.ObjectId(preferredOrderId));
    if (hit) return hit;
  }

  const orders = await Order.find({
    buyerId,
    status: { $in: [...ELIGIBLE_ORDER_STATUSES] }
  })
    .sort({ createdAt: -1 })
    .limit(40)
    .select("_id items")
    .lean();

  if (!orders.length) return null;

  const allPids = [...new Set(orders.flatMap((o) => (o.items || []).map((it) => it.productId)))];
  if (!allPids.length) return null;
  const prods = await Product.find({
    _id: { $in: allPids }
  })
    .select("businessId sellerId")
    .lean();
  const pmap = new Map(prods.map((p) => [p._id.toString(), p]));

  for (const o of orders) {
    const hit = (o.items || []).some((it) => {
      const p = pmap.get(it.productId.toString());
      return p ? productTouchesBusiness(p as { businessId?: mongoose.Types.ObjectId | null; sellerId?: mongoose.Types.ObjectId }, business) : false;
    });
    if (hit) return { orderId: o._id as mongoose.Types.ObjectId };
  }
  return null;
}

export const listBusinessReviews = asyncHandler(async (req: Request, res: Response) => {
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  const isOwner = Boolean(req.user?.id && b.ownerId.toString() === req.user.id);
  const isAdmin = req.user?.role === "admin";
  if (b.status !== "active" && !isOwner && !isAdmin) throw new HttpError(404, "Store not found");

  const businessOid = b._id instanceof mongoose.Types.ObjectId ? b._id : new mongoose.Types.ObjectId(String(b._id));
  const rows = await BusinessReview.find({ businessId: businessOid }).sort({ createdAt: -1 }).limit(100).lean();
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

export const getBusinessReviewStatus = asyncHandler(async (req: Request, res: Response) => {
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  if (b.status !== "active") throw new HttpError(404, "Store not found");

  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const businessOid = b._id instanceof mongoose.Types.ObjectId ? b._id : new mongoose.Types.ObjectId(String(b._id));

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const existing = await BusinessReview.findOne({ businessId: businessOid, buyerId }).lean();
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
    const pinned = await findOrderForStoreReview(buyerId, b, orderIdHint);
    if (pinned) {
      res.json({
        canSubmit: true,
        hasReview: false,
        orderId: pinned.orderId.toString()
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

  const found = await findOrderForStoreReview(buyerId, b, null);
  if (!found) {
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
    orderId: found.orderId.toString()
  });
});

export const createBusinessReview = asyncHandler(async (req: Request, res: Response) => {
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  if (b.status !== "active") throw new HttpError(404, "Store not found");

  const { rating, comment, orderId: orderIdRaw } = req.body as { rating: number; comment: string; orderId?: string };
  const orderId = String(orderIdRaw || "").trim();

  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const businessOid = b._id instanceof mongoose.Types.ObjectId ? b._id : new mongoose.Types.ObjectId(String(b._id));

  let orderOid: mongoose.Types.ObjectId | null = null;
  if (env.REVIEWS_SKIP_VERIFIED_PURCHASE && !orderId) {
    orderOid = null;
  } else {
    if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");
    const hit = await findOrderForStoreReview(buyerId, b, orderId);
    if (!hit) throw new HttpError(400, "Order not found or not eligible for this store review");
    orderOid = hit.orderId;
  }

  try {
    const rev = await BusinessReview.create({
      businessId: businessOid,
      buyerId,
      orderId: orderOid,
      rating,
      comment: comment || ""
    });
    res.status(201).json({
      review: {
        id: rev._id.toString(),
        businessId: rev.businessId.toString(),
        buyerId: rev.buyerId.toString(),
        rating: rev.rating,
        comment: rev.comment,
        createdAt: rev.createdAt
      }
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: number }).code === 11000) {
      throw new HttpError(409, "You already reviewed this store. Only one store review per shopper.");
    }
    throw e;
  }
});
