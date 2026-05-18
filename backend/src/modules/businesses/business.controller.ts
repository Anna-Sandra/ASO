import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import type { BusinessDoc, BusinessDayHours, BusinessType } from "./business.model";
import { Business, primaryProductCategoryForBusinessType } from "./business.model";
import { MenuSection } from "./menuSection.model";
import { Product } from "../products/product.model";
import { attachSellerPayments } from "../products/product.publicSerialize";
import { Review } from "../reviews/review.model";
import {
  createBusinessSchema,
  createMenuSectionSchema,
  listBusinessesQuerySchema,
  objectIdLike,
  updateBusinessSchema,
  updateMenuSectionSchema
} from "./business.schemas";

export function slugBaseFromName(name: string): string {
  const raw = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw.slice(0, 80) || "store";
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let candidate = base.slice(0, 120);
  let n = 0;
  while (await Business.exists({ slug: candidate })) {
    n += 1;
    const suffix = `-${n}`;
    candidate = `${base.slice(0, 120 - suffix.length)}${suffix}`;
  }
  return candidate;
}

export async function resolveBusinessByKey(key: string): Promise<BusinessDoc | null> {
  const k = key.trim();
  if (!k) return null;
  if (objectIdLike(k)) {
    return (await Business.findById(new mongoose.Types.ObjectId(k)).lean()) as BusinessDoc | null;
  }
  return (await Business.findOne({ slug: k.toLowerCase() }).lean()) as BusinessDoc | null;
}

function assertOwner(req: Request, b: BusinessDoc) {
  const uid = req.user?.id;
  if (!uid || b.ownerId.toString() !== uid) throw new HttpError(403, "Forbidden");
}

function serializeBusiness(b: BusinessDoc) {
  const id = b._id instanceof mongoose.Types.ObjectId ? b._id.toString() : String(b._id);
  const ownerId = b.ownerId instanceof mongoose.Types.ObjectId ? b.ownerId.toString() : String(b.ownerId);
  /** Lean docs may omit keys; match schema defaults so JSON never drops flags (undefined strips in JSON.stringify). */
  const pickupAvailable = b.pickupAvailable == null ? true : Boolean(b.pickupAvailable);
  const deliveryAvailable = b.deliveryAvailable == null ? false : Boolean(b.deliveryAvailable);
  return {
    id,
    ownerId,
    slug: b.slug,
    businessType: b.businessType,
    status: b.status,
    name: b.name,
    description: b.description,
    logoUrl: b.logoUrl,
    bannerUrl: b.bannerUrl,
    contactPhone: b.contactPhone,
    contactEmail: b.contactEmail,
    locationLabel: b.locationLabel,
    geoLocation: b.geoLocation,
    deliveryRadiusKm: b.deliveryRadiusKm,
    operatingHours: b.operatingHours,
    tags: b.tags,
    deliveryAvailable,
    pickupAvailable,
    estimatedDeliveryMins: b.estimatedDeliveryMins,
    deliveryFee: b.deliveryFee,
    settings: b.settings,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
  };
}

const categoryToBusinessType: Partial<Record<string, BusinessType>> = {
  food_drinks: "food_restaurant",
  fashion_accessories: "fashion_store",
  electronics_gadgets: "electronics_shop",
  beauty_personal_care: "beauty_shop",
  groceries_essentials: "grocery_store",
  books_academic: "academic_book",
  services: "service_provider"
};

/** Seller's default store for new listings — match category when they have several stores. */
export async function getSellerDefaultBusinessId(
  sellerId: mongoose.Types.ObjectId,
  hintCategory?: string
): Promise<mongoose.Types.ObjectId | null> {
  const rows = (await Business.find({ ownerId: sellerId })
    .sort({ updatedAt: -1 })
    .select("_id businessType status")
    .lean()) as BusinessDoc[];
  if (!rows.length) return null;
  if (rows.length === 1) {
    const id = rows[0]._id;
    return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
  }
  const wantType = hintCategory ? categoryToBusinessType[hintCategory] : undefined;
  if (wantType) {
    const match =
      rows.find((b) => b.businessType === wantType && b.status === "active") ||
      rows.find((b) => b.businessType === wantType);
    if (match) {
      const id = match._id;
      return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
    }
  }
  const id = rows[0]._id;
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
}

const orphanProductFilter = (sellerId: mongoose.Types.ObjectId) => ({
  sellerId,
  $or: [{ businessId: null }, { businessId: { $exists: false } }]
});

function notOnThisStoreFilter(businessId: mongoose.Types.ObjectId) {
  return {
    $or: [
      { businessId: null },
      { businessId: { $exists: false } },
      { businessId: { $ne: businessId } }
    ]
  };
}

/** Products that should move onto this store menu (unlinked or on another of the seller's stores). */
export function listingsToStoreFilter(
  sellerId: mongoose.Types.ObjectId,
  businessId: mongoose.Types.ObjectId,
  businessType: BusinessType,
  storeCount: number
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    sellerId,
    ...notOnThisStoreFilter(businessId)
  };
  if (storeCount === 1) return base;
  base.category = primaryProductCategoryForBusinessType(businessType);
  return base;
}

async function sellerStoreCount(ownerId: mongoose.Types.ObjectId): Promise<number> {
  return Business.countDocuments({ ownerId });
}

/** Move matching listings onto this store (e.g. all food from "nat" → "nateats"). */
export async function linkSellerListingsToBusiness(
  sellerId: mongoose.Types.ObjectId,
  businessId: mongoose.Types.ObjectId,
  businessType: BusinessType
): Promise<number> {
  const storeCount = await sellerStoreCount(sellerId);
  const filter = listingsToStoreFilter(sellerId, businessId, businessType, storeCount);
  const res = await Product.updateMany(filter, { $set: { businessId } });
  return res.modifiedCount ?? 0;
}

export async function linkOrphanProductsToBusiness(
  sellerId: mongoose.Types.ObjectId,
  businessId: mongoose.Types.ObjectId
): Promise<number> {
  const biz = (await Business.findById(businessId).select("businessType").lean()) as BusinessDoc | null;
  if (!biz) return 0;
  return linkSellerListingsToBusiness(sellerId, businessId, biz.businessType as BusinessType);
}

export async function countOrphanProductsForSeller(sellerId: mongoose.Types.ObjectId): Promise<number> {
  return Product.countDocuments(orphanProductFilter(sellerId));
}

export async function countListingsMovableToStore(
  sellerId: mongoose.Types.ObjectId,
  businessId: mongoose.Types.ObjectId,
  businessType: BusinessType
): Promise<number> {
  const storeCount = await sellerStoreCount(sellerId);
  return Product.countDocuments(listingsToStoreFilter(sellerId, businessId, businessType, storeCount));
}

export async function assertProductBusinessLink(opts: {
  sellerId: mongoose.Types.ObjectId;
  businessId?: string | null;
  menuSectionId?: string | null;
  category?: string;
}): Promise<{
  businessIdOid: mongoose.Types.ObjectId | null;
  menuSectionIdOid: mongoose.Types.ObjectId | null;
}> {
  let businessIdOid: mongoose.Types.ObjectId | null = null;
  let menuSectionIdOid: mongoose.Types.ObjectId | null = null;

  const bizRaw =
    opts.businessId === undefined
      ? undefined
      : opts.businessId === null
        ? null
        : String(opts.businessId).trim();
  if (bizRaw === null) {
    if (opts.menuSectionId && String(opts.menuSectionId).trim()) {
      throw new HttpError(400, "menuSectionId requires a businessId on the listing.");
    }
    return { businessIdOid: null, menuSectionIdOid: null };
  }
  if (bizRaw === undefined || !bizRaw) {
    if (opts.menuSectionId && String(opts.menuSectionId).trim()) {
      throw new HttpError(400, "menuSectionId requires a businessId on the listing.");
    }
    return { businessIdOid, menuSectionIdOid };
  }
  if (!mongoose.isValidObjectId(bizRaw)) throw new HttpError(400, "Invalid business id.");
  const biz = await Business.findById(bizRaw).lean();
  if (!biz) throw new HttpError(404, "Business not found");
  if (!(biz as BusinessDoc).ownerId.equals(opts.sellerId)) {
    throw new HttpError(403, "That business does not belong to your account.");
  }
  businessIdOid = (biz as BusinessDoc)._id;

  const primary = primaryProductCategoryForBusinessType((biz as BusinessDoc).businessType as BusinessType);
  if (opts.category && opts.category !== primary) {
    throw new HttpError(
      400,
      `Listings for "${(biz as BusinessDoc).businessType}" stores should use marketplace category "${primary}".`
    );
  }

  const isFoodStore = (biz as BusinessDoc).businessType === "food_restaurant";
  const menuRaw =
    opts.menuSectionId === undefined
      ? undefined
      : opts.menuSectionId === null
        ? null
        : String(opts.menuSectionId).trim();

  if (!isFoodStore) {
    menuSectionIdOid = null;
  } else if (menuRaw === null || menuRaw === "" || menuRaw === undefined) {
    menuSectionIdOid = null;
  } else {
    if (!mongoose.isValidObjectId(menuRaw)) throw new HttpError(400, "Invalid menu section id.");
    const sec = await MenuSection.findById(menuRaw).lean();
    if (!sec) throw new HttpError(404, "Menu section not found");
    if (!(sec as { businessId: mongoose.Types.ObjectId }).businessId.equals(businessIdOid)) {
      throw new HttpError(400, "Menu section does not belong to that business.");
    }
    menuSectionIdOid = (sec as { _id: mongoose.Types.ObjectId })._id;
  }

  return { businessIdOid, menuSectionIdOid };
}

export const listPublicBusinesses = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listBusinessesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid filters");
  const q = parsed.data;
  const filter: Record<string, unknown> = { status: "active" };
  if (q.type) filter.businessType = q.type;
  if (q.q?.trim()) filter.$text = { $search: q.q.trim() };
  const limit = q.limit;
  const rows = await Business.find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
  res.json({ businesses: rows.map((r) => serializeBusiness(r as BusinessDoc)) });
});

export const listMyBusinesses = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await Business.find({ ownerId }).sort({ updatedAt: -1 }).lean();
  res.json({ businesses: rows.map((r) => serializeBusiness(r as BusinessDoc)) });
});

export const createMyBusiness = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createBusinessSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Validation error");
  const body = parsed.data;
  const ownerId = new mongoose.Types.ObjectId(req.user!.id);
  const base = slugBaseFromName(body.name);
  const slug = await ensureUniqueSlug(base);
  const initialStatus = body.status === "pending_approval" ? "pending_approval" : "draft";
  const doc = await Business.create({
    ownerId,
    slug,
    businessType: body.businessType,
    status: initialStatus,
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
    logoUrl: body.logoUrl ?? null,
    bannerUrl: body.bannerUrl ?? null,
    contactPhone: body.contactPhone ?? "",
    contactEmail: body.contactEmail ?? "",
    locationLabel: body.locationLabel ?? "",
    geoLocation: body.geoLocation ?? null,
    deliveryRadiusKm: body.deliveryRadiusKm ?? null,
    operatingHours: (body.operatingHours ?? {}) as Record<string, BusinessDayHours>,
    tags: body.tags ?? [],
    deliveryAvailable: body.deliveryAvailable,
    pickupAvailable: body.pickupAvailable,
    estimatedDeliveryMins: body.estimatedDeliveryMins ?? null,
    deliveryFee: body.deliveryFee ?? null,
    settings: (body.settings ?? {}) as Record<string, unknown>
  });
  const b = doc.toObject() as BusinessDoc;
  const priorStores = await Business.countDocuments({ ownerId, _id: { $ne: doc._id } });
  let linkedOrphanProducts = 0;
  if (priorStores === 0) {
    linkedOrphanProducts = await linkOrphanProductsToBusiness(ownerId, doc._id);
  }
  res.status(201).json({ business: serializeBusiness(b), linkedOrphanProducts });
});

export const getBusinessByKey = asyncHandler(async (req: Request, res: Response) => {
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  if (b.status !== "active") {
    const isOwner = req.user?.id && b.ownerId.toString() === req.user.id;
    const isAdmin = req.user?.role === "admin";
    if (!isOwner && !isAdmin) throw new HttpError(404, "Store not found");
  }
  res.json({ business: serializeBusiness(b) });
});

export const updateMyBusinessByKey = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateBusinessSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Validation error");
  const patch = parsed.data;
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  assertOwner(req, b);
  const doc = await Business.findById(b._id);
  if (!doc) throw new HttpError(404, "Store not found");

  if (patch.status !== undefined) {
    const next = patch.status;
    if (next !== "draft" && next !== "pending_approval") {
      throw new HttpError(
        400,
        "You can save as draft or submit for approval only. An admin must approve your store before it goes live."
      );
    }
    doc.status = next;
  }

  const assignKeys = [
    "businessType",
    "description",
    "logoUrl",
    "bannerUrl",
    "contactPhone",
    "contactEmail",
    "locationLabel",
    "geoLocation",
    "deliveryRadiusKm",
    "operatingHours",
    "tags",
    "deliveryAvailable",
    "pickupAvailable",
    "estimatedDeliveryMins",
    "deliveryFee",
    "settings"
  ] as const;
  for (const k of assignKeys) {
    if (patch[k] !== undefined) {
      (doc as unknown as Record<string, unknown>)[k] = patch[k] as unknown;
    }
  }
  if (patch.name !== undefined) {
    const nm = String(patch.name).trim();
    if (nm.length >= 2) {
      if (nm !== doc.name) {
        doc.name = nm;
        doc.slug = await ensureUniqueSlug(slugBaseFromName(nm));
      }
    }
  }

  await doc.save();
  const out = doc.toObject() as BusinessDoc;
  res.json({ business: serializeBusiness(out) });
});

async function reviewSummaryForOwner(ownerId: mongoose.Types.ObjectId) {
  const rows = await Review.aggregate([
    { $match: { sellerId: ownerId } },
    { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } }
  ]);
  const r = rows[0] as { avgRating?: number; count?: number } | undefined;
  if (!r?.count) return { avgRating: null as number | null, count: 0 };
  return { avgRating: Math.round(Number(r.avgRating) * 10) / 10, count: Number(r.count) };
}

const buyerCandidateFilter: Record<string, unknown> = {
  status: "active",
  $or: [{ category: "services" }, { category: "food_drinks" }, { stock: { $gt: 0 } }]
};

export const getBusinessStorefront = asyncHandler(async (req: Request, res: Response) => {
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  const isOwner = Boolean(req.user?.id && b.ownerId.toString() === req.user.id);
  const isAdmin = req.user?.role === "admin";
  if (b.status !== "active" && !isOwner && !isAdmin) throw new HttpError(404, "Store not found");
  const bid = b._id;
  const sections =
    b.businessType === "food_restaurant"
      ? await MenuSection.find({ businessId: bid }).sort({ sortOrder: 1, title: 1 }).lean()
      : [];
  const storeCount = await sellerStoreCount(b.ownerId);
  let orphanListingCount = 0;
  let linkedOrphanProducts = 0;
  let unpublishedListingCount = 0;

  if (storeCount === 1 || isOwner || isAdmin) {
    linkedOrphanProducts = await linkSellerListingsToBusiness(
      b.ownerId,
      bid,
      b.businessType as BusinessType
    );
  }

  if (isOwner || isAdmin) {
    orphanListingCount = await countListingsMovableToStore(b.ownerId, bid, b.businessType as BusinessType);
    unpublishedListingCount = await Product.countDocuments({
      businessId: bid,
      status: { $ne: "active" }
    });
  }

  const productFilter = isOwner || isAdmin ? { businessId: bid } : { businessId: bid, ...buyerCandidateFilter };
  const productsRaw = await Product.find(productFilter).sort({ updatedAt: -1 }).lean();
  const products = await attachSellerPayments(productsRaw as unknown as Record<string, unknown>[]);
  const reviewSummary = await reviewSummaryForOwner(b.ownerId);
  /** Re-read doc so storefront matches DB after linking work; lean may omit booleans saved as defaults. */
  const persistedBusiness =
    ((await Business.findById(bid).lean()) as BusinessDoc | null) ?? (b as BusinessDoc);
  res.json({
    business: serializeBusiness(persistedBusiness),
    menuSections: sections.map((s) => ({
      id: s._id.toString(),
      title: s.title,
      sortOrder: s.sortOrder
    })),
    products,
    reviewSummary,
    orphanListingCount,
    linkedOrphanProducts,
    unpublishedListingCount
  });
});

/** Attach seller listings to this store — including items on another store (e.g. nat → nateats). */
export const linkMyListingsToStore = asyncHandler(async (req: Request, res: Response) => {
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  assertOwner(req, b);
  const linked = await linkSellerListingsToBusiness(b.ownerId, b._id, b.businessType as BusinessType);
  res.json({ linked });
});

export const listMenuSections = asyncHandler(async (req: Request, res: Response) => {
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  assertOwner(req, b);
  if (b.businessType !== "food_restaurant") {
    res.json({ menuSections: [] });
    return;
  }
  const rows = await MenuSection.find({ businessId: b._id }).sort({ sortOrder: 1, title: 1 }).lean();
  res.json({
    menuSections: rows.map((s) => ({ id: s._id.toString(), title: s.title, sortOrder: s.sortOrder }))
  });
});

export const createMenuSection = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createMenuSectionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Validation error");
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  assertOwner(req, b);
  if (b.businessType !== "food_restaurant") {
    throw new HttpError(400, "Menu sections are only used for restaurant storefronts.");
  }
  const doc = await MenuSection.create({
    businessId: b._id,
    title: parsed.data.title.trim(),
    sortOrder: parsed.data.sortOrder ?? 0
  });
  const s = doc.toObject();
  res.status(201).json({ menuSection: { id: doc._id.toString(), title: s.title, sortOrder: s.sortOrder } });
});

export const patchMenuSection = asyncHandler(async (req: Request, res: Response) => {
  const sid = req.params.sectionId;
  if (!mongoose.isValidObjectId(sid)) throw new HttpError(400, "Invalid section id");
  const parsed = updateMenuSectionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Validation error");
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  assertOwner(req, b);
  const doc = await MenuSection.findOne({ _id: sid, businessId: b._id });
  if (!doc) throw new HttpError(404, "Menu section not found");
  if (parsed.data.title !== undefined) doc.title = parsed.data.title.trim();
  if (parsed.data.sortOrder !== undefined) doc.sortOrder = parsed.data.sortOrder;
  await doc.save();
  res.json({
    menuSection: { id: doc._id.toString(), title: doc.title, sortOrder: doc.sortOrder }
  });
});

export const deleteMyBusinessByKey = asyncHandler(async (req: Request, res: Response) => {
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  assertOwner(req, b);
  const bid = b._id;
  await MenuSection.deleteMany({ businessId: bid });
  await Product.updateMany({ businessId: bid }, { $set: { businessId: null, menuSectionId: null } });
  await Business.findByIdAndDelete(bid);
  res.status(204).send();
});

export const deleteMenuSection = asyncHandler(async (req: Request, res: Response) => {
  const sid = req.params.sectionId;
  if (!mongoose.isValidObjectId(sid)) throw new HttpError(400, "Invalid section id");
  const b = await resolveBusinessByKey(req.params.key);
  if (!b) throw new HttpError(404, "Store not found");
  assertOwner(req, b);
  const doc = await MenuSection.findOne({ _id: sid, businessId: b._id });
  if (!doc) throw new HttpError(404, "Menu section not found");
  await Product.updateMany({ businessId: b._id, menuSectionId: doc._id }, { $set: { menuSectionId: null } });
  await doc.deleteOne();
  res.status(204).send();
});
