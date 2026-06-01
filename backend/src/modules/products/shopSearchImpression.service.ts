import mongoose from "mongoose";
import { ShopSearchImpression } from "./shopSearchImpression.model";

export function normalizeShopSearchQuery(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

/** Fire-and-forget: one row per seller who appeared in this search result set. */
export function logShopSearchImpressions(query: string, products: { sellerId?: unknown }[]): void {
  const q = normalizeShopSearchQuery(query);
  if (!q || q.length < 2) return;

  const sellerIds = new Set<string>();
  for (const p of products.slice(0, 48)) {
    const raw = p.sellerId;
    const sid =
      raw instanceof mongoose.Types.ObjectId
        ? raw.toString()
        : raw != null && String(raw).trim() && mongoose.isValidObjectId(String(raw))
          ? String(raw).trim()
          : "";
    if (sid) sellerIds.add(sid);
  }
  if (!sellerIds.size) return;

  const docs = [...sellerIds].map((sellerId) => ({
    sellerId: new mongoose.Types.ObjectId(sellerId),
    query: q,
    createdAt: new Date()
  }));

  void ShopSearchImpression.insertMany(docs, { ordered: false }).catch(() => {
    /* analytics must never break search */
  });
}

export async function topSearchTermsForSeller(
  sellerId: mongoose.Types.ObjectId,
  since: Date,
  limit = 10
): Promise<{ query: string; count: number }[]> {
  const rows = await ShopSearchImpression.aggregate<{ _id: string; c: number }>([
    { $match: { sellerId, createdAt: { $gte: since } } },
    { $group: { _id: "$query", c: { $sum: 1 } } },
    { $sort: { c: -1 } },
    { $limit: limit }
  ]);
  return rows.map((r) => ({ query: r._id, count: Number(r.c) || 0 }));
}
