import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { Order } from "../orders/order.model";
import { Review } from "../reviews/review.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";
import { resolveListingPublishOutcome } from "../platform/listingPolicyApply";
import type { ProductCategory, ProductDoc } from "./product.model";
import { Product, PRODUCT_CATEGORIES } from "./product.model";
import { normalizeCategoryAttributes } from "./categoryAttributes.schema";
import { listProductsQuerySchema, recommendedProductsQuerySchema, smartSearchBodySchema } from "./product.schemas";
import {
  activeStoreBusinessIds,
  attachSellerPayments,
  enrichPublicProducts,
  foodMenuStoreFilter
} from "./product.publicSerialize";
import { BuyerProductView } from "./buyerProductView.model";
import { ProductSave } from "./productSave.model";
import { assertProductBusinessLink, getSellerDefaultBusinessId } from "../businesses/business.controller";
import { notifySaversPriceDrop } from "../notifications/notification.service";
import { groqCompletion, groqConfigured } from "../assistant/groqChat";
import { detectCategoryFromMessage } from "../assistant/assistantFallback";
import { computeListingSearchAssist, isValidMarketplaceSubcategory } from "./productSubcategories";

/** Subcategory facet for buyer search chips + keyword assist; rejects unknown slugs once category is fixed. */
function normalizeProductSubcategoryForCategory(cat: ProductCategory, raw: unknown): string | null {
  if (raw === null) return null;
  if (raw === undefined || raw === "") return null;
  const id = String(raw).trim();
  if (!id) return null;
  if (!isValidMarketplaceSubcategory(cat, id)) {
    throw new HttpError(400, "Pick a Marketplace sub-category that belongs to your listing category.");
  }
  return id;
}
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
  "categoryAttributes",
  "businessId",
  "menuSectionId",
  "listingKind",
  "prepTimeMinutes",
  "addons",
  "subcategory"
] as const;

const MODERATION_REAPPROVE_KEYS = [
  "name",
  "description",
  "category",
  "subcategory",
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

/** Align with frontend filters / ribbons (case-sensitive tokens in catalog.js). */
function normalizeSellerTags(tags: unknown): string[] {
  const rawTags = Array.isArray(tags)
    ? (tags as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];
  return [...new Set(rawTags)].slice(0, 10);
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SMART_SEARCH_ROWS_CAP = 300;

/** Strip trailing ``` fences models sometimes emit. */
function stripJsonMarkdownFences(s: string): string {
  let t = s.trim();
  if (!t.startsWith("`")) return t;
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return t;
}

/** Quick token split — used when Groq is off or returns junk. */
function heuristicSearchKeywords(q: string): string[] {
  const t = q.trim().toLowerCase().replace(/\s+/g, " ");
  const stop = new Set([
    "the",
    "a",
    "an",
    "for",
    "and",
    "or",
    "to",
    "want",
    "looking",
    "cheap",
    "buy",
    "best",
    "near",
    "some",
    "please",
    "need",
    "get",
    "under",
    "within",
    "with",
    "show",
    "me",
    "find"
  ]);
  const parts = t
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stop.has(w))
    .slice(0, 6);
  if (parts.length) return parts;
  return t.length >= 2 ? [t.slice(0, 80)] : [];
}

async function aiExpandShopSearchTerms(q: string): Promise<{ keywords: string[]; categoryHint: ProductCategory | null }> {
  const fallbackKw = heuristicSearchKeywords(q);
  const heuristicCat = detectCategoryFromMessage(q);
  if (!groqConfigured()) {
    return { keywords: fallbackKw, categoryHint: heuristicCat };
  }
  const allowedCats = PRODUCT_CATEGORIES.join(", ");
  const system = `You help shoppers search a Ghana e-commerce marketplace (SHOPIQGH).

Respond with ONLY valid JSON — no markdown, no explanation. Keys:
- "keywords": array of 1–6 short phrases or words for catalogue search (include common synonyms and variants; omit filler words like "cheap", "best", "want", "looking for", "please").
- "category_hint": one of exactly [${allowedCats}] or null if unclear.

Prefer category_hint null when unsure.`;

  try {
    const text = await groqCompletion(system, [{ role: "user", content: q.trim().slice(0, 250) }]);
    if (!text) return { keywords: fallbackKw, categoryHint: heuristicCat };
    const trimmed = stripJsonMarkdownFences(text);
    const parsed = JSON.parse(trimmed) as { keywords?: unknown; category_hint?: unknown };
    const rawKw = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const keywords = [
      ...new Set(
        rawKw
          .map((x) => String(x ?? "").trim().toLowerCase().replace(/\s+/g, " "))
          .filter((s) => s.length >= 2 && s.length <= 64)
      )
    ].slice(0, 8);
    let categoryHint: ProductCategory | null = null;
    if (typeof parsed.category_hint === "string") {
      const c = parsed.category_hint.trim();
      if ((PRODUCT_CATEGORIES as readonly string[]).includes(c)) categoryHint = c as ProductCategory;
    }
    return {
      keywords: keywords.length ? keywords : fallbackKw,
      categoryHint: categoryHint ?? heuristicCat
    };
  } catch {
    return { keywords: fallbackKw, categoryHint: heuristicCat };
  }
}

async function fetchShopProductRows(opts: {
  filter: Record<string, unknown>;
  searchStr?: string;
}): Promise<Record<string, unknown>[]> {
  const { filter, searchStr } = opts;
  if (!searchStr?.trim()) {
    return (await Product.find(filter).sort({ updatedAt: -1 }).limit(SMART_SEARCH_ROWS_CAP).lean()) as unknown as Record<
      string,
      unknown
    >[];
  }
  const trimmed = searchStr.trim();
  let rows: Record<string, unknown>[];
  try {
    rows = (await Product.find({
      ...filter,
      $text: { $search: trimmed }
    })
      .sort({ score: { $meta: "textScore" } })
      .limit(SMART_SEARCH_ROWS_CAP)
      .lean()) as unknown as Record<string, unknown>[];
  } catch {
    rows = [];
  }
  if (!rows.length) {
    const terms = trimmed
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const termBlocks = terms.map((term) => {
      const re = new RegExp(escapeRegex(term), "i");
      return { $or: [{ name: re }, { description: re }, { tags: re }, { listingSearchAssist: re }] };
    });
    /** Smart search expands to many synonyms — OR matches any (“shoes”, “heels”, …), not ALL at once */
    const altFilter = termBlocks.length ? { ...filter, $or: termBlocks } : { ...filter };
    rows = (await Product.find(altFilter).sort({ updatedAt: -1 }).limit(SMART_SEARCH_ROWS_CAP).lean()) as unknown as Record<
      string,
      unknown
    >[];
  }
  return rows;
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid product filters.");
  const q = parsed.data;
  const filter: Record<string, unknown> = { status: "active" };
  if (q.businessId) {
    filter.businessId = new mongoose.Types.ObjectId(q.businessId);
  } else {
    const activeIds = await activeStoreBusinessIds();
    Object.assign(filter, foodMenuStoreFilter(activeIds));
  }
  if (q.category) {
    filter.category = q.category;
  }
  if (q.tag) filter.tags = q.tag;
  if (q.subcategory?.trim()) {
    filter.subcategory = q.subcategory.trim();
  }

  const priceCond: Record<string, number> = {};
  if (q.minPrice != null) priceCond.$gte = q.minPrice;
  if (q.maxPrice != null) priceCond.$lte = q.maxPrice;
  if (Object.keys(priceCond).length) filter.price = priceCond;

  let rows: Record<string, unknown>[];
  const searchStr = q.q?.trim();
  if (searchStr) {
    try {
      rows = (await Product.find({
        ...filter,
        $text: { $search: searchStr }
      })
        .sort({ score: { $meta: "textScore" } })
        .lean()) as unknown as Record<string, unknown>[];
    } catch {
      rows = [];
    }
    if (!rows.length) {
      const terms = searchStr
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const termBlocks =
        terms.length > 0
          ? terms.map((term) => {
              const re = new RegExp(escapeRegex(term), "i");
              return { $or: [{ name: re }, { description: re }, { tags: re }, { listingSearchAssist: re }] };
            })
          : [];
      const altFilter =
        termBlocks.length > 0 ? { ...filter, $and: termBlocks } : { ...filter };
      rows = (await Product.find(altFilter).sort({ updatedAt: -1 }).limit(500).lean()) as unknown as Record<
        string,
        unknown
      >[];
    }
  } else {
    rows = (await Product.find(filter).sort({ updatedAt: -1 }).lean()) as unknown as Record<string, unknown>[];
  }
  const enriched = await enrichPublicProducts(rows as unknown as Record<string, unknown>[]);
  res.json({ products: enriched });
});

/** Search bar intelligence: synonym expansion (+ optional Groq) and implicit category narrowing. */
export const smartSearchProducts = asyncHandler(async (req: Request, res: Response) => {
  const parsed = smartSearchBodySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid smart search payload.");

  const body = parsed.data;
  const filter: Record<string, unknown> = { status: "active" };
  const activeIds = await activeStoreBusinessIds();
  Object.assign(filter, foodMenuStoreFilter(activeIds));

  /** Only filter by category when the shopper picked a chip — never auto-apply AI/heuristic hints (hurts recall, e.g. shoes miscategorized). */
  const effectiveCategory: ProductCategory | undefined = body.category;
  const { keywords, categoryHint } = await aiExpandShopSearchTerms(body.q);
  if (effectiveCategory) filter.category = effectiveCategory;
  if (body.tag) filter.tags = body.tag;
  if (body.subcategory?.trim()) filter.subcategory = body.subcategory.trim();

  const priceCond: Record<string, number> = {};
  if (body.minPrice != null) priceCond.$gte = body.minPrice;
  if (body.maxPrice != null) priceCond.$lte = body.maxPrice;
  if (Object.keys(priceCond).length) filter.price = priceCond;

  const uniqKw = [...new Set(keywords)].slice(0, 6);
  const searchBlob = (uniqKw.length ? uniqKw.join(" ") : "").trim() || body.q.trim();

  let rows = await fetchShopProductRows({ filter, searchStr: searchBlob.slice(0, 400) });
  if (!rows.length && searchBlob !== body.q.trim()) {
    rows = await fetchShopProductRows({ filter, searchStr: body.q.trim() });
  }

  const enriched = await enrichPublicProducts(rows as unknown as Record<string, unknown>[]);
  res.json({
    products: enriched,
    smart: {
      keywordsUsed: [...new Set(keywords)].slice(0, 8),
      expandedQuery: searchBlob,
      categoryApplied: effectiveCategory ?? null,
      /** Softer UX hint — not applied as a Mongo filter unless the user taps that category chip. */
      categorySuggestion: !effectiveCategory ? categoryHint : null
    }
  });
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
  babies_infants: "Babies & Infants",
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

  const activeIds = await activeStoreBusinessIds();
  const candidateFilter: Record<string, unknown> = {
    status: "active",
    $or: [{ category: "services" }, { stock: { $gt: 0 } }],
    ...foodMenuStoreFilter(activeIds)
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
      title: personalized ? "Top picks for you" : "Popular on SHOPIQGH",
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

  const rowsOut: { id: string; title: string; products: Awaited<ReturnType<typeof enrichPublicProducts>> }[] = [];
  for (const r of rails) {
    const enriched = await enrichPublicProducts(r.picks as Record<string, unknown>[]);
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
  const activeIds = await activeStoreBusinessIds();
  const relatedBase = { ...buyerCandidateFilter, ...foodMenuStoreFilter(activeIds) };

  const similarRaw = await Product.find({
    ...relatedBase,
    _id: { $ne: oid },
    category: cat
  })
    .sort({ updatedAt: -1 })
    .limit(14)
    .lean();

  let exploreRaw = await Product.find({
    ...relatedBase,
    _id: { $ne: oid },
    category: { $ne: cat }
  })
    .sort({ updatedAt: -1 })
    .limit(14)
    .lean();

  if (exploreRaw.length < 4) {
    const fill = await Product.find({
      ...relatedBase,
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

  const similarEnriched = await enrichPublicProducts(similarRaw as unknown as Record<string, unknown>[]);
  const exploreEnriched = await enrichPublicProducts(exploreRaw as unknown as Record<string, unknown>[]);

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

/** Buyer-only: record a product listing view for recommendations (no body). */
export const recordProductView = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  if (req.user?.role !== "buyer" || !req.user?.id || !mongoose.isValidObjectId(req.user.id)) {
    res.status(204).end();
    return;
  }
  const p = await Product.findById(id).select("status").lean();
  if (!p || p.status !== "active") throw new HttpError(404, "Product not found");

  const buyerId = new mongoose.Types.ObjectId(req.user.id);
  const productId = new mongoose.Types.ObjectId(id);
  await BuyerProductView.findOneAndUpdate(
    { buyerId, productId },
    { $set: { viewedAt: new Date() } },
    { upsert: true }
  );
  res.status(204).end();
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
  const [out] = await enrichPublicProducts([p as unknown as Record<string, unknown>], {
    includePayoutDetails: req.user?.role === "admin"
  });
  res.json({ product: out });
});

export const listMyProducts = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await Product.find({ sellerId }).sort({ updatedAt: -1 }).lean();
  const enriched = await attachSellerPayments(rows as unknown as Record<string, unknown>[], {
    includePayoutDetails: true
  });
  res.json({ products: enriched });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const body = { ...(req.body as Record<string, unknown>) };
  body.tags = normalizeSellerTags(body.tags);
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

  let bizIdRaw = body.businessId;
  const menuSidRaw = body.menuSectionId;
  delete body.businessId;
  delete body.menuSectionId;
  delete (body as { listingSearchAssist?: unknown }).listingSearchAssist;
  const subRawPick = Object.prototype.hasOwnProperty.call(body, "subcategory") ? body.subcategory : undefined;
  delete body.subcategory;

  const categoryStr = String((body as { category?: string }).category || "");
  if (bizIdRaw === undefined || (typeof bizIdRaw === "string" && !String(bizIdRaw).trim())) {
    const def = await getSellerDefaultBusinessId(sellerId, categoryStr);
    if (def) bizIdRaw = def.toString();
  }
  const { businessIdOid, menuSectionIdOid } = await assertProductBusinessLink({
    sellerId,
    businessId:
      bizIdRaw === undefined
        ? undefined
        : bizIdRaw === null
          ? null
          : String(bizIdRaw as string).trim() || undefined,
    menuSectionId:
      menuSidRaw === undefined
        ? undefined
        : menuSidRaw === null
          ? null
          : String(menuSidRaw as string).trim() || undefined,
    category: categoryStr
  });

  const createPayload: Record<string, unknown> = { ...body, status, sellerId };
  createPayload.businessId = businessIdOid;
  createPayload.menuSectionId = menuSectionIdOid;
  const catRef = categoryStr as ProductCategory;
  createPayload.subcategory = normalizeProductSubcategoryForCategory(catRef, subRawPick);
  createPayload.listingSearchAssist = computeListingSearchAssist(catRef, createPayload.subcategory as string | null);
  if (flagged) createPayload.flagged = true;
  if (rejectionReason) createPayload.rejectionReason = rejectionReason;

  const p = await Product.create(createPayload);
  const [out] = await attachSellerPayments([p.toObject() as unknown as Record<string, unknown>], {
    includePayoutDetails: true
  });
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
  if (Object.prototype.hasOwnProperty.call(body, "tags")) {
    body.tags = normalizeSellerTags(body.tags);
  }
  delete (body as { listingSearchAssist?: unknown }).listingSearchAssist;
  const modTouched = sellerModerationTouched(beforeDoc, body);
  const settings = await getOrCreateSettings();

  for (const key of SELLER_UPDATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (key === "businessId" || key === "menuSectionId" || key === "subcategory") continue;
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

  let bizForAssert = Object.prototype.hasOwnProperty.call(body, "businessId")
    ? body.businessId
    : p.businessId ?? undefined;
  if (
    (bizForAssert === undefined || (typeof bizForAssert === "string" && !String(bizForAssert).trim())) &&
    !p.businessId
  ) {
    const def = await getSellerDefaultBusinessId(new mongoose.Types.ObjectId(req.user!.id), mergedCat);
    if (def) bizForAssert = def.toString();
  }
  const menuForAssert = Object.prototype.hasOwnProperty.call(body, "menuSectionId")
    ? body.menuSectionId
    : p.menuSectionId ?? undefined;

  const { businessIdOid, menuSectionIdOid } = await assertProductBusinessLink({
    sellerId: new mongoose.Types.ObjectId(req.user!.id),
    businessId:
      bizForAssert === undefined
        ? undefined
        : bizForAssert === null
          ? null
          : String(bizForAssert as mongoose.Types.ObjectId | string),
    menuSectionId:
      menuForAssert === undefined
        ? undefined
        : menuForAssert === null
          ? null
          : String(menuForAssert as mongoose.Types.ObjectId | string),
    category: mergedCat
  });
  p.businessId = businessIdOid;
  p.menuSectionId = menuSectionIdOid;

  const mergedCatResolved = mergedCat;
  const prevCat = beforeDoc.category as ProductCategory;
  const prevSub = beforeDoc.subcategory ? String(beforeDoc.subcategory) : null;
  let nextSub: string | null;
  if (Object.prototype.hasOwnProperty.call(body, "subcategory")) {
    nextSub = normalizeProductSubcategoryForCategory(mergedCatResolved, body.subcategory);
  } else if (
    mergedCatResolved !== prevCat &&
    prevSub != null &&
    !isValidMarketplaceSubcategory(mergedCatResolved, prevSub)
  ) {
    nextSub = null;
  } else {
    nextSub = p.subcategory != null ? String(p.subcategory) : null;
  }
  p.subcategory = nextSub;
  p.set("listingSearchAssist", computeListingSearchAssist(mergedCatResolved, nextSub));

  const mergedPrice = Number(p.price);
  if (!(mergedPrice > 0)) {
    throw new HttpError(400, "Set a price greater than zero for this listing.");
  }

  await p.save();
  const newPriceN = Number(p.price);
  const oldPriceN = Number(beforeDoc.price);
  if (p.status === "active" && newPriceN < oldPriceN - 1e-9) {
    notifySaversPriceDrop({
      productId: p._id,
      oldPrice: oldPriceN,
      newPrice: newPriceN,
      productName: String(p.name || "Listing")
    });
  }

  const [out] = await attachSellerPayments([p.toObject() as unknown as Record<string, unknown>], {
    includePayoutDetails: true
  });
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
