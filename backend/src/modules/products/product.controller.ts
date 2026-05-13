import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { Order } from "../orders/order.model";
import { Review } from "../reviews/review.model";
import { getEffectiveCommissionPercent, getOrCreateSettings } from "../platform/platformSettings.service";
import { resolveListingPublishOutcome } from "../platform/listingPolicyApply";
import type { ProductCategory, ProductDoc } from "./product.model";
import { Product } from "./product.model";
import { normalizeCategoryAttributes } from "./categoryAttributes.schema";
import { listProductsQuerySchema, recommendedProductsQuerySchema } from "./product.schemas";

/** Public-facing fields; changes require re-approval if the listing was already live. */
const SELLER_UPDATE_KEYS = [
  "name",
  "description",
  "category",
  "price",
  "compareAtPrice",
  "stock",
  "tags",
  "imageUrls",
  "categoryAttributes"
] as const;

const MODERATION_REAPPROVE_KEYS = [
  "name",
  "description",
  "category",
  "price",
  "compareAtPrice",
  "tags",
  "imageUrls",
  "categoryAttributes"
] as const;

type SellerUpdateKey = (typeof SELLER_UPDATE_KEYS)[number];

function fieldChanged(key: string, from: unknown, to: unknown): boolean {
  if (key === "price" || key === "compareAtPrice") {
    const na = from == null || from === "" ? null : Number(from);
    const nb = to == null || to === "" ? null : Number(to);
    if (na == null && nb == null) return false;
    if (na == null || nb == null) return true;
    return na !== nb;
  }
  if (key === "categoryAttributes") {
    return JSON.stringify(from ?? {}) !== JSON.stringify(to ?? {});
  }
  if (key === "tags" || key === "imageUrls") {
    return JSON.stringify(from ?? []) !== JSON.stringify(to ?? []);
  }
  return String(from ?? "") !== String(to ?? "");
}

function sellerModerationTouched(
  before: ProductDoc,
  body: Record<string, unknown>
): boolean {
  const prev = before as unknown as Record<string, unknown>;
  for (const k of MODERATION_REAPPROVE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    if (fieldChanged(k, prev[k], body[k])) return true;
  }
  return false;
}

function toPublicProduct(p: Record<string, unknown>) {
  return {
    id: (p._id as mongoose.Types.ObjectId).toString(),
    sellerId: (p.sellerId as mongoose.Types.ObjectId).toString(),
    name: p.name,
    description: p.description,
    category: p.category,
    categoryAttributes: (p.categoryAttributes && typeof p.categoryAttributes === "object" ? p.categoryAttributes : {}) as Record<
      string,
      unknown
    >,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    stock: p.stock,
    status: p.status,
    rejectionReason: p.rejectionReason,
    tags: p.tags,
    imageUrls: p.imageUrls,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

export async function attachSellerPayments(products: Record<string, unknown>[]) {
  if (!products.length) return [];
  const commissionPercent = await getEffectiveCommissionPercent();
  const sellerIds = [...new Set(products.map((p) => (p.sellerId as mongoose.Types.ObjectId).toString()))];
  const users = await User.find({
    _id: { $in: sellerIds.map((id) => new mongoose.Types.ObjectId(id)) }
  })
    .select("_id displayName phone email bankName bankAccountNumber bankAccountName")
    .lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  return products.map((p) => {
    const base = toPublicProduct(p);
    const su = byId.get((p.sellerId as mongoose.Types.ObjectId).toString());
    if (!su) return base;
    return {
      ...base,
      /** Service fee rate on the seller’s list price; fees are added for the buyer at checkout (v2 orders). */
      platformCommissionPercent: commissionPercent,
      sellerPayment: {
        displayName: su.displayName ?? "",
        phone: su.phone ?? "",
        email: su.email ?? "",
        bankName: su.bankName ?? "",
        bankAccountNumber: su.bankAccountNumber ?? "",
        bankAccountName: su.bankAccountName ?? ""
      }
    };
  });
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid product filters.");
  const q = parsed.data;
  const filter: Record<string, unknown> = { status: "active" };
  if (q.category) filter.category = q.category;
  if (q.tag) filter.tags = q.tag;

  const priceCond: Record<string, number> = {};
  if (q.minPrice != null) priceCond.$gte = q.minPrice;
  if (q.maxPrice != null) priceCond.$lte = q.maxPrice;
  if (Object.keys(priceCond).length) filter.price = priceCond;

  let rows;
  if (q.q?.trim()) {
    rows = await Product.find({
      ...filter,
      $text: { $search: q.q.trim() }
    })
      .sort({ score: { $meta: "textScore" } })
      .lean();
  } else {
    rows = await Product.find(filter).sort({ updatedAt: -1 }).lean();
  }
  const enriched = await attachSellerPayments(rows as unknown as Record<string, unknown>[]);
  res.json({ products: enriched });
});

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** Display names for recommendation row subtitles (keep in sync with buyer catalog labels). */
const REC_CATEGORY_LABEL: Record<string, string> = {
  food_drinks: "Food & Drinks",
  fashion_accessories: "Fashion & Accessories",
  electronics_gadgets: "Electronics & Gadgets",
  beauty_personal_care: "Beauty & Personal Care",
  services: "Services",
  books_academic: "Books & Academic Materials",
  groceries_essentials: "Groceries & Essentials"
};

const REC_PER_ROW = 10;
const REC_MIN_TO_SHOW_ROW = 3;

type ScoredProduct = {
  p: Record<string, unknown> & ProductDoc;
  score: number;
  cheapPart: number;
  trustPart: number;
};

function takeUniqueProducts(scored: ScoredProduct[], used: Set<string>, max: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of scored) {
    const id = (s.p._id as mongoose.Types.ObjectId).toString();
    if (used.has(id)) continue;
    used.add(id);
    out.push(s.p);
    if (out.length >= max) break;
  }
  return out;
}

/** Rule-based personalization + Netflix-style multi-row rails (deduplicated). */
export const recommendProducts = asyncHandler(async (req: Request, res: Response) => {
  const parsed = recommendedProductsQuerySchema.safeParse(req.query);
  const qp = parsed.success ? parsed.data : { limit: 12, preferCheaper: true };
  const preferCheaper = qp.preferCheaper !== false;

  const candidateFilter: Record<string, unknown> = {
    status: "active",
    $or: [{ category: "services" }, { stock: { $gt: 0 } }]
  };

  const raw = await Product.find(candidateFilter).sort({ updatedAt: -1 }).limit(480).lean();
  if (!raw.length) {
    return res.json({ rows: [], products: [], personalization: false, preferCheaper });
  }

  const ids = raw.map((p) => p._id);
  type AggRow = { _id: mongoose.Types.ObjectId; avg?: number; n?: number };
  const aggRows: AggRow[] = ids.length
    ? await Review.aggregate<AggRow>([
        { $match: { productId: { $in: ids } } },
        { $group: { _id: "$productId", avg: { $avg: "$rating" }, n: { $sum: 1 } } }
      ])
    : [];
  const ratingByPid = new Map<string, { avg: number; n: number }>();
  for (const r of aggRows) {
    ratingByPid.set(r._id.toString(), { avg: Number(r.avg) || 0, n: Number(r.n) || 0 });
  }

  const byCat = new Map<string, number[]>();
  for (const p of raw as ProductDoc[]) {
    if (p.category === "services") continue;
    const price = Number(p.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const arr = byCat.get(p.category) ?? [];
    arr.push(price);
    byCat.set(p.category, arr);
  }
  const medianByCat = new Map<string, number>();
  for (const [cat, prices] of byCat.entries()) {
    const sorted = [...prices].sort((a, b) => a - b);
    medianByCat.set(cat, sorted[Math.floor(sorted.length / 2)] ?? sorted[0] ?? 1);
  }

  const preferredCats = new Set<string>();
  let personalized = false;
  const uid =
    req.user?.role === "buyer" && req.user?.id && mongoose.isValidObjectId(req.user.id) ? req.user.id : "";
  if (uid && mongoose.isValidObjectId(uid)) {
    const orders = await Order.find({
      buyerId: new mongoose.Types.ObjectId(uid),
      status: { $in: ["paid", "processing", "sent_for_delivery", "delivered"] }
    })
      .sort({ updatedAt: -1 })
      .limit(40)
      .select("items")
      .lean();
    const pids = new Set<string>();
    for (const o of orders as { items?: { productId?: unknown }[] }[]) {
      for (const it of o.items || []) {
        const pid =
          it.productId instanceof mongoose.Types.ObjectId
            ? it.productId.toString()
            : typeof it.productId === "string" && mongoose.isValidObjectId(it.productId)
              ? it.productId
              : "";
        if (pid) pids.add(pid);
      }
    }
    if (pids.size) {
      personalized = true;
      const pidObjs = [...pids].map((id) => new mongoose.Types.ObjectId(id));
      const past = await Product.find({ _id: { $in: pidObjs } })
        .select("category")
        .lean();
      for (const p of past) preferredCats.add(String((p as { category?: string }).category ?? ""));
    }
  }

  function reliabilityPart(productIdStr: string) {
    const r = ratingByPid.get(productIdStr);
    if (!r?.n)
      return 0.52; /** mild prior — unknown listings stay in the race */
    const stars = clamp01(Number(r.avg) / 5);
    const proof = clamp01(Math.log1p(Math.min(r.n, 40)) / Math.log1p(40));
    return clamp01(stars * 0.74 + proof * 0.26);
  }

  type RowLean = Record<string, unknown> & ProductDoc;
  const scored: ScoredProduct[] = (raw as unknown as RowLean[]).map((p) => {
    const id = (p._id as mongoose.Types.ObjectId).toString();
    let cheapPart = 0.52;
    if (p.category !== "services") {
      const price = Number(p.price);
      const med = medianByCat.get(p.category) ?? price;
      if (Number.isFinite(price) && med > 0) {
        const ratio = price / (med * 1.65);
        cheapPart = clamp01(1.15 - ratio);
      }
    }
    const trustPart = reliabilityPart(id);
    const personalBump = preferredCats.has(p.category) ? 0.07 : 0;
    const wCheap = preferCheaper ? 0.44 : 0.29;
    const wTrust = preferCheaper ? 0.49 : 0.63;
    const score = cheapPart * wCheap + trustPart * wTrust + personalBump;
    return { p, score, cheapPart, trustPart };
  });

  const used = new Set<string>();
  type Rail = { id: string; title: string; picks: Record<string, unknown>[] };
  const rails: Rail[] = [];

  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const forYou = takeUniqueProducts(byScore, used, REC_PER_ROW);
  if (forYou.length) {
    rails.push({
      id: "for_you",
      title: personalized ? "Top picks for you" : "Popular on Campus Mart",
      picks: forYou
    });
  }

  const prefList = [...preferredCats].filter((c) => Boolean(c && REC_CATEGORY_LABEL[c]));
  for (const cat of prefList.slice(0, 2)) {
    const inCat = scored.filter((s) => s.p.category === (cat as ProductCategory)).sort((a, b) => b.score - a.score);
    const picks = takeUniqueProducts(inCat, used, REC_PER_ROW);
    if (picks.length >= REC_MIN_TO_SHOW_ROW) {
      rails.push({
        id: `because_${cat}`,
        title: `More in ${REC_CATEGORY_LABEL[cat] ?? cat}`,
        picks
      });
    }
  }

  const byValue = [...scored].sort((a, b) => b.cheapPart - a.cheapPart);
  const valuePicks = takeUniqueProducts(byValue, used, REC_PER_ROW);
  if (valuePicks.length >= REC_MIN_TO_SHOW_ROW) {
    rails.push({
      id: "great_value",
      title: "Great value",
      picks: valuePicks
    });
  }

  const byRated = [...scored].sort((a, b) => b.trustPart - a.trustPart);
  const ratedPicks = takeUniqueProducts(byRated, used, REC_PER_ROW);
  if (ratedPicks.length >= REC_MIN_TO_SHOW_ROW) {
    rails.push({
      id: "top_reviewed",
      title: "Best reviewed",
      picks: ratedPicks
    });
  }

  const rowsOut: { id: string; title: string; products: Awaited<ReturnType<typeof attachSellerPayments>> }[] = [];
  for (const r of rails) {
    const enriched = await attachSellerPayments(r.picks as Record<string, unknown>[]);
    if (enriched.length) rowsOut.push({ id: r.id, title: r.title, products: enriched });
  }

  const flat = rowsOut[0]?.products ?? [];

  res.json({
    rows: rowsOut,
    products: flat,
    personalization: personalized,
    preferCheaper
  });
});

/** Same storefront visibility rules as {@link recommendProducts} (in-stock physical + active services). */
const buyerCandidateFilter: Record<string, unknown> = {
  status: "active",
  $or: [{ category: "services" }, { stock: { $gt: 0 } }]
};

/** Rule-based discovery for product detail: cross-category “explore” + same-category “similar”. No ML required. */
export const getRelatedProducts = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const oid = new mongoose.Types.ObjectId(id);
  const current = await Product.findById(oid).select("category").lean();
  if (!current) throw new HttpError(404, "Product not found");

  const cat = String((current as { category?: string }).category ?? "");

  const similarRaw = await Product.find({
    ...buyerCandidateFilter,
    _id: { $ne: oid },
    category: cat
  })
    .sort({ updatedAt: -1 })
    .limit(14)
    .lean();

  let exploreRaw = await Product.find({
    ...buyerCandidateFilter,
    _id: { $ne: oid },
    category: { $ne: cat }
  })
    .sort({ updatedAt: -1 })
    .limit(14)
    .lean();

  if (exploreRaw.length < 4) {
    const fill = await Product.find({
      ...buyerCandidateFilter,
      _id: { $ne: oid }
    })
      .sort({ updatedAt: -1 })
      .limit(40)
      .lean();
    const seen = new Set(exploreRaw.map((p) => p._id.toString()));
    for (const p of fill) {
      const sid = p._id.toString();
      if (seen.has(sid)) continue;
      exploreRaw.push(p);
      seen.add(sid);
      if (exploreRaw.length >= 14) break;
    }
  }

  const similarEnriched = await attachSellerPayments(similarRaw as unknown as Record<string, unknown>[]);
  const exploreEnriched = await attachSellerPayments(exploreRaw as unknown as Record<string, unknown>[]);

  const similarLabel = REC_CATEGORY_LABEL[cat] || (cat ? cat.replace(/_/g, " ") : "this category");

  res.json({
    explore: {
      title: "Explore your interests",
      products: exploreEnriched
    },
    similar: {
      title: `More in ${similarLabel}`,
      products: similarEnriched
    }
  });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id).lean();
  if (!p) throw new HttpError(404, "Product not found");
  const isOwner = p.sellerId.toString() === req.user?.id;
  const isAdmin = req.user?.role === "admin";
  if (p.status !== "active" && !isOwner && !isAdmin) {
    throw new HttpError(404, "Product not found");
  }
  const [out] = await attachSellerPayments([p as unknown as Record<string, unknown>]);
  res.json({ product: out });
});

export const listMyProducts = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await Product.find({ sellerId }).sort({ updatedAt: -1 }).lean();
  const enriched = await attachSellerPayments(rows as unknown as Record<string, unknown>[]);
  res.json({ products: enriched });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const body = { ...(req.body as Record<string, unknown>) };
  const existingTags = Array.isArray(body.tags) ? (body.tags as unknown[]).map((t) => String(t)) : [];
  body.tags = [...new Set(["new", ...existingTags])];
  /** "Publish" from the app sends `active`; policy may auto-approve, queue, flag, or reject. */
  const wantsPublish = body.status === "active";
  delete (body as { status?: unknown }).status;

  const settings = await getOrCreateSettings();
  let status: ProductDoc["status"] = "draft";
  let flagged = false;
  let rejectionReason: string | null | undefined;

  if (wantsPublish) {
    const name = String((body as { name?: string }).name || "");
    const description = String((body as { description?: string }).description || "");
    const tags = (body.tags as string[]) || [];
    const outcome = resolveListingPublishOutcome({
      settings,
      name,
      description,
      tags,
      beforeStatus: "draft",
      modTouched: true
    });
    status = outcome.status;
    flagged = outcome.flagged;
    rejectionReason = outcome.rejectionReason ?? undefined;
  }

  const createPayload: Record<string, unknown> = { ...body, status, sellerId };
  if (flagged) createPayload.flagged = true;
  if (rejectionReason) createPayload.rejectionReason = rejectionReason;

  const p = await Product.create(createPayload);
  const [out] = await attachSellerPayments([p.toObject() as unknown as Record<string, unknown>]);
  res.status(201).json({ product: out });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  if (p.sellerId.toString() !== req.user!.id) throw new HttpError(403, "Forbidden");

  const beforeStatus = p.status;
  const beforeDoc = p.toObject() as ProductDoc;
  const body = req.body as Record<string, unknown>;
  const modTouched = sellerModerationTouched(beforeDoc, body);
  const settings = await getOrCreateSettings();

  for (const key of SELLER_UPDATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (key === "categoryAttributes") {
      const cat =
        body.category !== undefined ? (body.category as ProductCategory) : (p.category as ProductCategory);
      (p as unknown as { categoryAttributes: Record<string, unknown> }).categoryAttributes =
        normalizeCategoryAttributes(cat, body.categoryAttributes);
      continue;
    }
    (p as unknown as Record<string, unknown>)[key] = body[key as SellerUpdateKey];
  }

  const applyOutcome = (outcome: ReturnType<typeof resolveListingPublishOutcome>) => {
    p.status = outcome.status;
    p.flagged = outcome.flagged;
    if (outcome.rejectionReason) p.rejectionReason = outcome.rejectionReason;
    else if (outcome.status !== "rejected") p.set("rejectionReason", null);
  };

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const st = body.status as string;
    if (st === "draft") {
      p.status = "draft";
      p.flagged = false;
      p.set("rejectionReason", null);
    } else if (st === "active") {
      const outcome = resolveListingPublishOutcome({
        settings,
        name: String(p.name),
        description: String(p.description || ""),
        tags: (p.tags as string[]) || [],
        beforeStatus,
        modTouched
      });
      applyOutcome(outcome);
    }
  } else if (beforeStatus === "active" && modTouched) {
    const outcome = resolveListingPublishOutcome({
      settings,
      name: String(p.name),
      description: String(p.description || ""),
      tags: (p.tags as string[]) || [],
      beforeStatus: "active",
      modTouched: true
    });
    applyOutcome(outcome);
  }

  const mergedCat = String(p.category) as ProductCategory;
  const mergedPrice = Number(p.price);
  if (mergedCat !== "services" && !(mergedPrice > 0)) {
    throw new HttpError(
      400,
      "Set a price greater than zero for this listing type, or choose Services for contact-based pricing."
    );
  }

  await p.save();
  const [out] = await attachSellerPayments([p.toObject() as unknown as Record<string, unknown>]);
  res.json({ product: out });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  if (p.sellerId.toString() !== req.user!.id) throw new HttpError(403, "Forbidden");
  await p.deleteOne();
  res.status(204).send();
});
