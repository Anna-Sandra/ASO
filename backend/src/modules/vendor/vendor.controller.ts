import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { roundMoney, splitLineGross } from "../../utils/commission";
import { User } from "../auth/user.model";
import { Order } from "../orders/order.model";
import { Product } from "../products/product.model";
import { Review } from "../reviews/review.model";
import { withContacts } from "../orders/orderSerialize";
import type { VendorAnalyticsEventType } from "./vendorAnalyticsEvent.model";
import { VendorAnalyticsEvent } from "./vendorAnalyticsEvent.model";

const PAID_ORDER_STATUSES = ["paid", "processing", "sent_for_delivery", "delivered"] as const;

/** Join review → product so we can match the owning seller even when `review.sellerId` was never written (legacy rows). */
function reviewMatchStagesForSeller(sid: mongoose.Types.ObjectId): mongoose.PipelineStage[] {
  return [
    {
      $lookup: {
        from: Product.collection.collectionName,
        localField: "productId",
        foreignField: "_id",
        as: "_product"
      }
    },
    { $unwind: { path: "$_product", preserveNullAndEmptyArrays: true } },
    {
      $match: {
        $or: [{ sellerId: sid }, { "_product.sellerId": sid }]
      }
    }
  ];
}

function chartDayRange(days: number): { dayKeys: string[]; startUtc: Date } {
  const clamped = Math.min(90, Math.max(7, Math.floor(days)));
  const dayKeys: string[] = [];
  const now = new Date();
  for (let i = clamped - 1; i >= 0; i--) {
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    dayKeys.push(t.toISOString().slice(0, 10));
  }
  const startUtc = new Date(`${dayKeys[0]}T00:00:00.000Z`);
  return { dayKeys, startUtc };
}

export const listVendorOrders = asyncHandler(async (req: Request, res: Response) => {
  const sid = req.user!.id;
  const sidOid = new mongoose.Types.ObjectId(sid);
  const rows = await Order.find({ "items.sellerId": sidOid }).sort({ createdAt: -1 }).lean();
  const serialized = await withContacts(rows as unknown as Record<string, unknown>[]);
  /** Only this seller's line items + per-vendor totals so the dashboard always matches JWT user. */
  const orders = serialized.map((o) => {
    const items = (
      o.items as Array<{
        sellerId: string;
        unitPrice: number;
        quantity: number;
        sellerProceeds: number;
      }>
    ).filter((it) => String(it.sellerId) === sid);
    const vendorLineGross = roundMoney(
      items.reduce((s, it) => s + Number(it.unitPrice) * Number(it.quantity), 0)
    );
    const vendorSellerProceeds = roundMoney(
      items.reduce((s, it) => s + Number(it.sellerProceeds ?? 0), 0)
    );
    return {
      ...o,
      items,
      vendorLineGross,
      vendorSellerProceeds,
      buyerOrderTotal: o.total
    };
  });
  res.json({ orders });
});

const sellerAllowed = new Set(["processing", "sent_for_delivery", "delivered", "cancelled"]);

export const updateVendorOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { status } = req.body as { status: string };
  if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");
  if (!sellerAllowed.has(status)) throw new HttpError(400, "Invalid status transition");

  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order not found");

  const sid = req.user!.id;
  const touchesSeller = order.items.some((it) => it.sellerId.toString() === sid);
  if (!touchesSeller) throw new HttpError(403, "Forbidden");

  if (status === "cancelled") {
    if (!["paid", "processing", "awaiting_vendor_payment"].includes(order.status)) {
      throw new HttpError(400, "Cannot cancel this order");
    }
    order.status = "cancelled";
  } else {
    if (order.status === "pending_payment" || order.status === "awaiting_vendor_payment") {
      throw new HttpError(400, "Order not paid yet — confirm buyer payment first if they paid off-platform");
    }
    if (order.status === "cancelled" || order.status === "delivered") throw new HttpError(400, "Invalid state");
    if (status === "processing" && order.status !== "paid") throw new HttpError(400, "Invalid transition");
    if (status === "sent_for_delivery" && !["paid", "processing"].includes(order.status)) throw new HttpError(400, "Invalid transition");
    if (status === "delivered" && !["paid", "processing", "sent_for_delivery"].includes(order.status)) {
      throw new HttpError(400, "Invalid transition");
    }
    order.status = status as typeof order.status;
  }

  await order.save();
  const [serialized] = await withContacts([order.toObject() as unknown as Record<string, unknown>]);
  res.json({ order: serialized });
});

/** After buyer pays via MoMo/bank (off-platform), each involved seller confirms receipt; then order becomes `paid` and stock is reduced. */
export const confirmVendorPaymentReceived = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;
  if (!mongoose.isValidObjectId(orderId)) throw new HttpError(400, "Invalid order id");

  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== "awaiting_vendor_payment") {
    throw new HttpError(400, "This order is not waiting for vendor payment confirmation");
  }

  const sid = new mongoose.Types.ObjectId(req.user!.id);
  const touchesSeller = order.items.some((it) => it.sellerId.equals(sid));
  if (!touchesSeller) throw new HttpError(403, "Forbidden");

  const confirmed = order.confirmedSellerIds || [];
  if (!confirmed.some((id) => id.equals(sid))) {
    order.confirmedSellerIds = [...confirmed, sid];
  }

  const uniqueSellerIds = [...new Set(order.items.map((it) => it.sellerId.toString()))];
  const updatedConfirmed = order.confirmedSellerIds ?? [];
  const allConfirmed = uniqueSellerIds.every((uid) =>
    updatedConfirmed.some((cid) => cid.toString() === uid)
  );

  if (allConfirmed) {
    order.status = "paid";
    for (const it of order.items) {
      await Product.updateOne({ _id: it.productId }, { $inc: { stock: -it.quantity } });
    }
  }

  await order.save();
  try {
    await VendorAnalyticsEvent.create({
      sellerId: new mongoose.Types.ObjectId(sid),
      type: "order_status_update",
      meta: { orderId, status }
    });
  } catch {
    /* analytics must never block order updates */
  }
  const [serialized] = await withContacts([order.toObject() as unknown as Record<string, unknown>]);
  res.json({ order: serialized });
});

export const recordVendorAnalyticsEvent = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { type: VendorAnalyticsEventType; productId?: string; meta?: Record<string, unknown> };
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  let productOid: mongoose.Types.ObjectId | undefined;
  if (body.productId) {
    if (!mongoose.isValidObjectId(body.productId)) throw new HttpError(400, "Invalid product id");
    const p = await Product.findOne({ _id: body.productId, sellerId: sellerId }).select("_id").lean();
    if (!p) throw new HttpError(404, "Product not found");
    productOid = p._id as mongoose.Types.ObjectId;
  }
  await VendorAnalyticsEvent.create({
    sellerId,
    type: body.type,
    productId: productOid,
    meta: body.meta ?? null
  });
  res.status(201).json({ ok: true });
});

export const vendorAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const sid = new mongoose.Types.ObjectId(req.user!.id);
  const daysRaw = typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 30;
  const { dayKeys, startUtc } = chartDayRange(Number.isFinite(daysRaw) ? daysRaw : 30);

  const productCount = await Product.countDocuments({ sellerId: sid });
  const orders = await Order.find({
    "items.sellerId": sid,
    status: { $in: [...PAID_ORDER_STATUSES] }
  }).lean();

  let revenue = 0;
  let orderCount = 0;
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};

  for (const o of orders) {
    orderCount += 1;
    for (const it of o.items) {
      if (it.sellerId.toString() !== sid.toString()) continue;
      const gross = roundMoney(it.unitPrice * it.quantity);
      const proceeds =
        typeof (it as { sellerProceeds?: number }).sellerProceeds === "number"
          ? (it as { sellerProceeds: number }).sellerProceeds
          : splitLineGross(gross).sellerProceeds;
      revenue += proceeds;
      const pid = it.productId.toString();
      if (!productSales[pid]) productSales[pid] = { name: it.name, qty: 0, revenue: 0 };
      productSales[pid].qty += it.quantity;
      productSales[pid].revenue += proceeds;
    }
  }

  const topProducts = Object.entries(productSales)
    .map(([id, v]) => ({ productId: id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const reviewCountAgg = await Review.aggregate<{ n: number }>([...reviewMatchStagesForSeller(sid), { $count: "n" }]);
  const reviewCount = reviewCountAgg[0]?.n ?? 0;

  const dailyRows = dayKeys.map((date) => ({
    date,
    revenue: 0,
    orderCount: 0,
    eventCounts: {} as Record<string, number>
  }));
  const dayMap = new Map(dailyRows.map((r) => [r.date, r]));

  const seriesOrders = await Order.find({
    "items.sellerId": sid,
    status: { $in: [...PAID_ORDER_STATUSES] },
    createdAt: { $gte: startUtc }
  })
    .select("createdAt items")
    .lean();

  for (const o of seriesOrders) {
    const dk = o.createdAt ? new Date(o.createdAt as Date).toISOString().slice(0, 10) : "";
    const bucket = dayMap.get(dk);
    if (!bucket) continue;
    bucket.orderCount += 1;
    for (const it of o.items) {
      if (it.sellerId.toString() !== sid.toString()) continue;
      const gross = roundMoney(it.unitPrice * it.quantity);
      const proceeds =
        typeof (it as { sellerProceeds?: number }).sellerProceeds === "number"
          ? (it as { sellerProceeds: number }).sellerProceeds
          : splitLineGross(gross).sellerProceeds;
      bucket.revenue += proceeds;
    }
    bucket.revenue = roundMoney(bucket.revenue);
  }

  const agg = await VendorAnalyticsEvent.aggregate<{ _id: { d: string; t: string }; c: number }>([
    {
      $match: {
        sellerId: sid,
        createdAt: { $gte: startUtc }
      }
    },
    {
      $group: {
        _id: {
          d: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
          t: "$type"
        },
        c: { $sum: 1 }
      }
    }
  ]);

  for (const row of agg) {
    const d = row._id.d;
    const t = row._id.t;
    const b = dayMap.get(d);
    if (!b) continue;
    b.eventCounts[t] = (b.eventCounts[t] || 0) + row.c;
  }

  res.json({
    productCount,
    orderCount,
    revenue: Math.round(revenue * 100) / 100,
    topProducts,
    reviewCount,
    /** Percent of each order line (buyer price × qty) retained by the marketplace; your revenue above is after this fee. */
    platformCommissionPercent: env.PLATFORM_COMMISSION_PERCENT,
    chart: {
      days: dayKeys.length,
      daily: dailyRows
    }
  });
});

export const listVendorReviews = asyncHandler(async (req: Request, res: Response) => {
  const sid = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await Review.aggregate<{
    _id: mongoose.Types.ObjectId;
    productId: mongoose.Types.ObjectId;
    buyerId: mongoose.Types.ObjectId;
    rating: number;
    comment: string;
    createdAt: Date;
    _product?: { name?: string };
  }>([...reviewMatchStagesForSeller(sid), { $sort: { createdAt: -1 } }, { $limit: 100 }]);

  const bidSet = [...new Set(rows.map((r) => r.buyerId.toString()))];
  const buyers = bidSet.length
    ? await User.find({ _id: { $in: bidSet.map((x) => new mongoose.Types.ObjectId(x)) } })
        .select("displayName")
        .lean()
    : [];
  const nameByBuyer = new Map(
    buyers.map((u) => [u._id.toString(), (u.displayName || "").trim() || "Buyer"])
  );

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    reviews: rows.map((r) => ({
      id: r._id.toString(),
      productId: r.productId.toString(),
      productName: r._product?.name || "Product",
      buyerId: r.buyerId.toString(),
      buyerDisplayName: nameByBuyer.get(r.buyerId.toString()) || "Buyer",
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt
    }))
  });
});
