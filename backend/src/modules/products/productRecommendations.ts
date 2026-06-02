import mongoose from "mongoose";
import { CartSnapshot } from "../cart/cartSnapshot.model";
import { Order } from "../orders/order.model";
import { BuyerProductView } from "./buyerProductView.model";
import type { ProductDoc } from "./product.model";
import { Product } from "./product.model";
import { ProductSave } from "./productSave.model";

export const PAID_ORDER_STATUSES = ["paid", "processing", "sent_for_delivery", "delivered"] as const;

const BEHAVIOR_WEIGHT_VIEW = 1;
const BEHAVIOR_WEIGHT_SAVE = 2;
const BEHAVIOR_WEIGHT_CART = 3;
const BEHAVIOR_WEIGHT_PURCHASE = 5;

/** Rolling window for trending signals and recent cart activity. */
export const TRENDING_WINDOW_MS = 48 * 60 * 60 * 1000;

function productIdStr(raw: unknown): string {
  if (raw instanceof mongoose.Types.ObjectId) return raw.toString();
  if (typeof raw === "string" && mongoose.isValidObjectId(raw)) return raw;
  return "";
}

function viewRecencyMultiplier(viewedAt: Date): number {
  const ageH = (Date.now() - viewedAt.getTime()) / 3_600_000;
  if (ageH <= 72) return 1;
  if (ageH <= 168) return 0.5;
  return 0.25;
}

export type UserBehaviorProfile = {
  productWeights: Map<string, number>;
  maxWeight: number;
  preferredCats: Set<string>;
  personalized: boolean;
};

/** Weighted views, saves, cart lines, and purchases for rule-based personalization. */
export async function buildUserBehaviorProfile(
  buyerId: mongoose.Types.ObjectId
): Promise<UserBehaviorProfile> {
  const productWeights = new Map<string, number>();
  const bump = (pid: string, w: number) => {
    if (!pid || w <= 0) return;
    productWeights.set(pid, (productWeights.get(pid) || 0) + w);
  };

  const since = new Date(Date.now() - TRENDING_WINDOW_MS);

  const [views, saves, orders, carts] = await Promise.all([
    BuyerProductView.find({ buyerId }).select("productId viewedAt").lean(),
    ProductSave.find({ ownerKey: `u:${buyerId.toString()}` }).select("productId").lean(),
    Order.find({
      buyerId,
      status: { $in: [...PAID_ORDER_STATUSES] }
    })
      .sort({ updatedAt: -1 })
      .limit(60)
      .select("items")
      .lean(),
    CartSnapshot.find({ buyerId, updatedAt: { $gte: since } })
      .select("items")
      .lean()
  ]);

  for (const v of views) {
    const pid = productIdStr(v.productId);
    if (!pid) continue;
    bump(pid, BEHAVIOR_WEIGHT_VIEW * viewRecencyMultiplier(new Date(v.viewedAt)));
  }
  for (const s of saves) {
    bump(productIdStr(s.productId), BEHAVIOR_WEIGHT_SAVE);
  }
  for (const o of orders as { items?: { productId?: unknown; quantity?: number }[] }[]) {
    for (const it of o.items || []) {
      const pid = productIdStr(it.productId);
      const qty = Math.max(1, Math.min(99, Number(it.quantity) || 1));
      bump(pid, BEHAVIOR_WEIGHT_PURCHASE * qty);
    }
  }
  for (const snap of carts) {
    for (const it of snap.items || []) {
      const pid = productIdStr(it.productId);
      const qty = Math.max(1, Math.min(99, Number(it.quantity) || 1));
      bump(pid, BEHAVIOR_WEIGHT_CART * qty);
    }
  }

  let maxWeight = 0;
  for (const w of productWeights.values()) maxWeight = Math.max(maxWeight, w);

  const preferredCats = new Set<string>();
  const personalized = productWeights.size > 0;
  if (productWeights.size) {
    const topPids = [...productWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([id]) => new mongoose.Types.ObjectId(id));
    const past = await Product.find({ _id: { $in: topPids } })
      .select("category")
      .lean();
    for (const p of past) preferredCats.add(String((p as { category?: string }).category ?? ""));
  }

  return { productWeights, maxWeight, preferredCats, personalized };
}

/** Product ids ranked by recent views, cart adds, and paid orders (48h). */
export async function getTrendingProductIds(limit: number, excludeIds?: Set<string>): Promise<string[]> {
  const since = new Date(Date.now() - TRENDING_WINDOW_MS);
  const scores = new Map<string, number>();

  const bump = (pid: string, w: number) => {
    if (!pid || w <= 0) return;
    if (excludeIds?.has(pid)) return;
    scores.set(pid, (scores.get(pid) || 0) + w);
  };

  const [viewAgg, orderAgg, carts] = await Promise.all([
    BuyerProductView.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { viewedAt: { $gte: since } } },
      { $group: { _id: "$productId", n: { $sum: 1 } } }
    ]),
    Order.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      {
        $match: {
          status: { $in: [...PAID_ORDER_STATUSES] },
          updatedAt: { $gte: since }
        }
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          n: { $sum: { $multiply: ["$items.quantity", BEHAVIOR_WEIGHT_PURCHASE] } }
        }
      }
    ]),
    CartSnapshot.find({ updatedAt: { $gte: since } })
      .select("items")
      .lean()
  ]);

  for (const r of viewAgg) bump(productIdStr(r._id), Number(r.n) || 0);
  for (const r of orderAgg) bump(productIdStr(r._id), Number(r.n) || 0);
  for (const snap of carts) {
    for (const it of snap.items || []) {
      const pid = productIdStr(it.productId);
      const qty = Math.max(1, Math.min(99, Number(it.quantity) || 1));
      bump(pid, BEHAVIOR_WEIGHT_CART * qty);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

/** Order co-occurrence: other products in the same paid orders as `productId`. */
export async function fetchFrequentlyBoughtTogetherProducts(
  productId: string,
  limit: number,
  candidateFilter: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  if (!mongoose.isValidObjectId(productId)) return [];
  const oid = new mongoose.Types.ObjectId(productId);

  const orders = await Order.find({
    status: { $in: [...PAID_ORDER_STATUSES] },
    "items.productId": oid
  })
    .select("items")
    .limit(400)
    .lean();

  const coCount = new Map<string, number>();
  for (const o of orders as { items?: { productId?: unknown }[] }[]) {
    const linePids = new Set<string>();
    for (const it of o.items || []) {
      const pid = productIdStr(it.productId);
      if (pid) linePids.add(pid);
    }
    if (!linePids.has(productId)) continue;
    for (const pid of linePids) {
      if (pid === productId) continue;
      coCount.set(pid, (coCount.get(pid) || 0) + 1);
    }
  }

  const topIds = [...coCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (!topIds.length) return [];

  const docs = await Product.find({
    ...candidateFilter,
    _id: { $in: topIds.map((id) => new mongoose.Types.ObjectId(id)) }
  }).lean();

  const byId = new Map(docs.map((d) => [d._id.toString(), d as ProductDoc]));
  return topIds
    .map((id) => byId.get(id))
    .filter((p): p is ProductDoc => Boolean(p))
    .map((p) => p as unknown as Record<string, unknown>);
}
