import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { Business } from "../businesses/business.model";
import { Product } from "../products/product.model";
import { User } from "../auth/user.model";
import { Promotion, type PromotionDoc, type PromotionKind } from "./promotion.model";
import { PUBLIC_PRODUCT_DEAL_KINDS } from "./promotionDeal.service";
import { rewriteStoredMediaNullable } from "../../utils/publicMediaUrl";
import { notifySaversDealLive } from "../notifications/notification.service";

function nowEligibleFilter(extra: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    reviewStatus: "approved" as const,
    endsAt: { $gt: now },
    $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }],
    ...extra
  };
}

function serializeProductMini(p: {
  _id: mongoose.Types.ObjectId;
  name?: string;
  price?: number;
  imageUrls?: string[];
  sellerId?: mongoose.Types.ObjectId;
}) {
  const img = Array.isArray(p.imageUrls) && p.imageUrls[0];
  return {
    id: p._id.toString(),
    name: String(p.name || ""),
    price: Number(p.price) || 0,
    imageUrl: img ? rewriteStoredMediaNullable(img) : null
  };
}

async function loadProductsFor(ids: mongoose.Types.ObjectId[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof serializeProductMini>>();
  const rows = await Product.find({ _id: { $in: ids } })
    .select("name price imageUrls sellerId")
    .lean();
  const m = new Map<string, ReturnType<typeof serializeProductMini>>();
  for (const r of rows) {
    m.set(r._id.toString(), serializeProductMini(r as Parameters<typeof serializeProductMini>[0]));
  }
  return m;
}

async function loadBusinessNames(ids: mongoose.Types.ObjectId[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await Business.find({ _id: { $in: ids } })
    .select("name slug")
    .lean();
  return new Map(rows.map((b) => [b._id.toString(), String(b.name || "Store")]));
}

function codeNormalize(raw: string | undefined | null) {
  const u = String(raw || "").trim().toUpperCase();
  return u || "";
}

function serializePromotionPublic(
  raw: Record<string, unknown>,
  ctx: { product?: ReturnType<typeof serializeProductMini>; businessName?: string }
) {
  const o = raw;
  const _id = o._id as mongoose.Types.ObjectId;
  return {
    id: _id.toString(),
    kind: o.kind as PromotionKind,
    title: String(o.title || ""),
    subtitle: String(o.subtitle || ""),
    code: codeNormalize(String(o.code || "")) || undefined,
    discountPercent: o.discountPercent != null ? Number(o.discountPercent) : undefined,
    discountAmountGhs: o.discountAmountGhs != null ? Number(o.discountAmountGhs) : undefined,
    minOrderGhs: o.minOrderGhs != null ? Number(o.minOrderGhs) : undefined,
    freeDelivery: Boolean(o.freeDelivery),
    compareAtGhs: o.compareAtGhs != null ? Number(o.compareAtGhs) : undefined,
    salePriceGhs: o.salePriceGhs != null ? Number(o.salePriceGhs) : undefined,
    startsAt: o.startsAt ? new Date(String(o.startsAt)).toISOString() : null,
    endsAt: new Date(String(o.endsAt || "")).toISOString(),
    soldPercent: o.soldPercent != null ? Number(o.soldPercent) : undefined,
    tagBadge: String(o.tagBadge || "") || undefined,
    gradientKey: String(o.gradientKey || "violet") || "violet",
    imageUrl: o.imageUrl ? rewriteStoredMediaNullable(String(o.imageUrl)) : null,
    categoryKey: o.categoryKey ? String(o.categoryKey) : null,
    linkPath: o.linkPath ? String(o.linkPath) : null,
    businessId: o.businessId
      ? (o.businessId as mongoose.Types.ObjectId).toString()
      : null,
    productId: o.productId ? (o.productId as mongoose.Types.ObjectId).toString() : null,
    product: ctx.product,
    businessName: ctx.businessName,
    priority: Number(o.priority) || 0
  };
}

/** Shoppers — energetic deals hub (banners, flash, spotlight cards, vendor blocks). */
export const getPublicDealsCatalog = asyncHandler(async (_req: Request, res: Response) => {
  const kinds: PromotionKind[] = ["banner", "flash_sale", "deal_discount", "deal_bundle", "spotlight", "vendor_promo"];
  const rows = await Promotion.find({
    ...nowEligibleFilter({ kind: { $in: kinds } })
  })
    .sort({ priority: -1, endsAt: 1 })
    .limit(100)
    .lean();

  const productDealKinds = new Set<PromotionKind>(["flash_sale", "deal_discount", "deal_bundle"]);
  const productIds = rows
    .filter((r) => productDealKinds.has(r.kind) && r.productId)
    .map((r) => r.productId as mongoose.Types.ObjectId);
  const bizIds = rows
    .filter((r) => r.kind === "vendor_promo" && r.businessId)
    .map((r) => r.businessId as mongoose.Types.ObjectId);

  const [pmap, bmap] = await Promise.all([loadProductsFor(productIds), loadBusinessNames(bizIds)]);

  const out = rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    const pid = r.productId ? r.productId.toString() : "";
    const bid = r.businessId ? r.businessId.toString() : "";
    return serializePromotionPublic(row, {
      product: pid ? pmap.get(pid) : undefined,
      businessName: bid ? bmap.get(bid) : undefined
    });
  });

  res.set("Cache-Control", "public, max-age=60");
  res.json({
    promotions: out,
    grouped: {
      banners: out.filter((x) => x.kind === "banner"),
      flashSales: out.filter((x) => x.kind === "flash_sale" || x.kind === "deal_discount"),
      bundles: out.filter((x) => x.kind === "deal_bundle"),
      spotlights: out.filter((x) => x.kind === "spotlight"),
      vendorPromos: out.filter((x) => x.kind === "vendor_promo")
    }
  });
});

/** Shoppers — wallet-style coupons (approved, in date). */
export const getPublicCouponsCatalog = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await Promotion.find({
    ...nowEligibleFilter({ kind: "coupon" })
  })
    .sort({ priority: -1, endsAt: 1 })
    .limit(80)
    .lean();

  const bizIds = rows.map((r) => r.businessId).filter(Boolean) as mongoose.Types.ObjectId[];
  const bmap = await loadBusinessNames(bizIds);

  const coupons = rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    const bid = r.businessId ? r.businessId.toString() : "";
    const base = serializePromotionPublic(row, { businessName: bid ? bmap.get(bid) : undefined });
    return {
      ...base,
      scope: bid ? ("vendor" as const) : ("global" as const)
    };
  });

  res.set("Cache-Control", "public, max-age=60");
  res.json({
    coupons,
    /** Placeholder until checkout attributes real savings to a user. */
    savingsStats: {
      savedThisMonthGhs: null as number | null,
      activeCount: coupons.length,
      usedLifetime: null as number | null
    }
  });
});

async function assertProductOwnedBySeller(productId: string, sellerOid: mongoose.Types.ObjectId) {
  if (!mongoose.isValidObjectId(productId)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(productId).select("sellerId").lean();
  if (!p) throw new HttpError(404, "Product not found");
  if (!p.sellerId.equals(sellerOid)) throw new HttpError(403, "That product is not yours");
}

async function assertBusinessOwnedBySeller(businessId: string, sellerOid: mongoose.Types.ObjectId) {
  if (!mongoose.isValidObjectId(businessId)) throw new HttpError(400, "Invalid store id");
  const b = await Business.findById(businessId).select("ownerId").lean();
  if (!b) throw new HttpError(404, "Store not found");
  if (!b.ownerId.equals(sellerOid)) throw new HttpError(403, "That store is not yours");
}

export const createVendorPromotion = asyncHandler(async (req: Request, res: Response) => {
  const sellerOid = new mongoose.Types.ObjectId(req.user!.id);
  const body = req.body as Record<string, unknown>;
  const kind = String(body.kind || "") as PromotionKind;

  let businessIdOid: mongoose.Types.ObjectId | null = null;
  let productIdOid: mongoose.Types.ObjectId | null = null;
  if (body.businessId && String(body.businessId).trim()) {
    await assertBusinessOwnedBySeller(String(body.businessId), sellerOid);
    businessIdOid = new mongoose.Types.ObjectId(String(body.businessId));
  }
  if (body.productId && String(body.productId).trim()) {
    await assertProductOwnedBySeller(String(body.productId), sellerOid);
    productIdOid = new mongoose.Types.ObjectId(String(body.productId));
  }

  const codeRaw = codeNormalize(body.code as string);
  if (kind === "coupon") {
    if (!codeRaw) throw new HttpError(400, "Coupon code is required");
    const clash = await Promotion.findOne({ code: codeRaw }).select("_id").lean();
    if (clash) throw new HttpError(409, "That code is already taken");
  }

  const productKinds: PromotionKind[] = ["flash_sale", "deal_discount", "deal_bundle"];
  if (productKinds.includes(kind) && !productIdOid) throw new HttpError(400, "This deal requires a product");

  let endsAtDate: Date;
  if (kind === "deal_discount" && (body.endsAt === undefined || body.endsAt === null || body.endsAt === "")) {
    endsAtDate = new Date("2099-12-31T23:59:59.000Z");
  } else {
    if (!body.endsAt) throw new HttpError(400, "End date/time is required.");
    endsAtDate = new Date(String(body.endsAt));
  }
  if (Number.isNaN(endsAtDate.getTime())) throw new HttpError(400, "Invalid end date.");

  const doc = await Promotion.create({
    kind,
    reviewStatus: "pending",
    sellerId: sellerOid,
    businessId: businessIdOid,
    productId: productIdOid,
    title: String(body.title || "").trim(),
    subtitle: String(body.subtitle || "").trim(),
    code: kind === "coupon" ? codeRaw : "",
    discountPercent: body.discountPercent != null ? Number(body.discountPercent) : null,
    discountAmountGhs: body.discountAmountGhs != null ? Number(body.discountAmountGhs) : null,
    minOrderGhs: body.minOrderGhs != null ? Number(body.minOrderGhs) : null,
    freeDelivery: Boolean(body.freeDelivery),
    compareAtGhs: body.compareAtGhs != null ? Number(body.compareAtGhs) : null,
    salePriceGhs: body.salePriceGhs != null ? Number(body.salePriceGhs) : null,
    startsAt: body.startsAt ? new Date(String(body.startsAt)) : null,
    endsAt: endsAtDate,
    soldPercent: body.soldPercent != null ? Number(body.soldPercent) : null,
    tagBadge: String(body.tagBadge || "").trim(),
    gradientKey: String(body.gradientKey || "violet").trim(),
    imageUrl: body.imageUrl ? String(body.imageUrl).trim().slice(0, 500) : null,
    categoryKey: body.categoryKey ? String(body.categoryKey).trim().slice(0, 64) : null,
    linkPath: body.linkPath ? String(body.linkPath).trim().slice(0, 500) : null,
    priority: Number(body.priority) || 0
  });

  res.status(201).json({
    promotion: {
      id: doc._id.toString(),
      kind: doc.kind,
      reviewStatus: doc.reviewStatus,
      title: doc.title,
      endsAt: doc.endsAt
    }
  });
});

export const listVendorPromotions = asyncHandler(async (req: Request, res: Response) => {
  const sellerOid = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await Promotion.find({ sellerId: sellerOid }).sort({ createdAt: -1 }).limit(200).lean();
  const productIds = rows.map((r) => r.productId).filter(Boolean) as mongoose.Types.ObjectId[];
  const pmap = await loadProductsFor(productIds);
  const now = new Date();

  const promotions = rows.map((r) => {
    const pid = r.productId ? r.productId.toString() : "";
    const mini = pid ? pmap.get(pid) : undefined;
    const approved = r.reviewStatus === "approved";
    const notExpired = r.endsAt ? new Date(r.endsAt).getTime() > now.getTime() : false;
    const started =
      r.startsAt == null ? true : new Date(r.startsAt).getTime() <= now.getTime();
    const isLive = approved && notExpired && started;

    return {
      id: r._id.toString(),
      kind: r.kind,
      reviewStatus: r.reviewStatus,
      title: r.title,
      subtitle: r.subtitle,
      code: codeNormalize(r.code) || undefined,
      endsAt: r.endsAt,
      startsAt: r.startsAt ?? undefined,
      productId: pid || undefined,
      productName: mini?.name,
      catalogPriceGhs: mini?.price,
      compareAtGhs: r.compareAtGhs != null ? Number(r.compareAtGhs) : undefined,
      salePriceGhs: r.salePriceGhs != null ? Number(r.salePriceGhs) : undefined,
      discountPercent: r.discountPercent != null ? Number(r.discountPercent) : undefined,
      tagBadge: r.tagBadge || undefined,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      isLive
    };
  });

  res.json({ promotions });
});

export const endVendorPromotion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid id");
  const sellerOid = new mongoose.Types.ObjectId(req.user!.id);
  const doc = await Promotion.findById(id);
  if (!doc || !doc.sellerId || !doc.sellerId.equals(sellerOid)) {
    throw new HttpError(404, "Promotion not found");
  }
  doc.endsAt = new Date();
  await doc.save();
  res.json({ ok: true });
});

export const adminListPromotions = asyncHandler(async (req: Request, res: Response) => {
  const status = String(req.query.status || "pending");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter: Record<string, unknown> = {};
  if (status !== "all") filter.reviewStatus = status;

  const [total, rows] = await Promise.all([
    Promotion.countDocuments(filter),
    Promotion.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
  ]);

  res.json({
    total,
    page,
    limit,
    promotions: rows.map((r) => ({
      id: r._id.toString(),
      kind: r.kind,
      reviewStatus: r.reviewStatus,
      sellerId: r.sellerId ? r.sellerId.toString() : null,
      businessId: r.businessId ? r.businessId.toString() : null,
      productId: r.productId ? r.productId.toString() : null,
      title: r.title,
      subtitle: r.subtitle,
      code: codeNormalize(r.code) || undefined,
      endsAt: r.endsAt,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt
    }))
  });
});

export const adminApprovePromotion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid id");
  const adminOid = new mongoose.Types.ObjectId(req.user!.id);
  const doc = await Promotion.findById(id);
  if (!doc) throw new HttpError(404, "Promotion not found");
  if (doc.reviewStatus === "approved") {
    res.json({ ok: true, promotion: { id: doc._id.toString(), reviewStatus: doc.reviewStatus } });
    return;
  }
  doc.reviewStatus = "approved";
  doc.rejectionReason = null;
  doc.reviewedAt = new Date();
  doc.reviewedBy = adminOid;
  await doc.save();

  try {
    if (
      doc.productId &&
      (PUBLIC_PRODUCT_DEAL_KINDS as readonly string[]).includes(doc.kind) &&
      doc.salePriceGhs != null &&
      Number(doc.salePriceGhs) > 0
    ) {
      const p = await Product.findById(doc.productId).select("name price sellerId").lean();
      if (p) {
        const sale = Number(doc.salePriceGhs);
        const was = doc.compareAtGhs != null ? Number(doc.compareAtGhs) : Number(p.price) || 0;
        if (sale < was) {
          const u = await User.findById(p.sellerId).select("displayName email").lean();
          type ULean = { displayName?: string; email?: string };
          const ux = u as ULean | null;
          const vendorLabel = ((ux?.displayName || "").trim() || (ux?.email || "").trim() || "A seller").slice(0, 60);
          notifySaversDealLive({
            productId: doc.productId,
            productName: String(p.name || ""),
            salePrice: sale,
            wasPrice: was,
            endsAt: doc.endsAt instanceof Date ? doc.endsAt : new Date(doc.endsAt),
            vendorLabel
          });
        }
      }
    }
  } catch {
    /* best-effort */
  }

  res.json({ ok: true, promotion: { id: doc._id.toString(), reviewStatus: doc.reviewStatus } });
});

export const adminRejectPromotion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid id");
  const adminOid = new mongoose.Types.ObjectId(req.user!.id);
  const reason = String((req.body as { reason?: string })?.reason || "").trim().slice(0, 2000);
  const doc = await Promotion.findById(id);
  if (!doc) throw new HttpError(404, "Promotion not found");
  doc.reviewStatus = "rejected";
  doc.rejectionReason = reason || "Not approved";
  doc.reviewedAt = new Date();
  doc.reviewedBy = adminOid;
  await doc.save();
  res.json({ ok: true, promotion: { id: doc._id.toString(), reviewStatus: doc.reviewStatus } });
});

export const adminCreatePlatformPromotion = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const kind = String(body.kind || "") as PromotionKind;
  const codeRaw = codeNormalize(body.code as string);
  if (kind === "coupon") {
    if (!codeRaw) throw new HttpError(400, "Coupon code is required");
    const clash = await Promotion.findOne({ code: codeRaw }).select("_id").lean();
    if (clash) throw new HttpError(409, "That code is already taken");
  }

  const businessIdOid =
    body.businessId && String(body.businessId).trim() && mongoose.isValidObjectId(String(body.businessId))
      ? new mongoose.Types.ObjectId(String(body.businessId))
      : null;
  const productIdOid =
    body.productId && String(body.productId).trim() && mongoose.isValidObjectId(String(body.productId))
      ? new mongoose.Types.ObjectId(String(body.productId))
      : null;

  const doc = await Promotion.create({
    kind,
    reviewStatus: (body.reviewStatus as PromotionDoc["reviewStatus"]) || "approved",
    sellerId: null,
    businessId: businessIdOid,
    productId: productIdOid,
    title: String(body.title || "").trim(),
    subtitle: String(body.subtitle || "").trim(),
    code: kind === "coupon" ? codeRaw : "",
    discountPercent: body.discountPercent != null ? Number(body.discountPercent) : null,
    discountAmountGhs: body.discountAmountGhs != null ? Number(body.discountAmountGhs) : null,
    minOrderGhs: body.minOrderGhs != null ? Number(body.minOrderGhs) : null,
    freeDelivery: Boolean(body.freeDelivery),
    compareAtGhs: body.compareAtGhs != null ? Number(body.compareAtGhs) : null,
    salePriceGhs: body.salePriceGhs != null ? Number(body.salePriceGhs) : null,
    startsAt: body.startsAt ? new Date(String(body.startsAt)) : null,
    endsAt: new Date(String(body.endsAt || "")),
    soldPercent: body.soldPercent != null ? Number(body.soldPercent) : null,
    tagBadge: String(body.tagBadge || "").trim(),
    gradientKey: String(body.gradientKey || "violet").trim(),
    imageUrl: body.imageUrl ? String(body.imageUrl).trim().slice(0, 500) : null,
    categoryKey: body.categoryKey ? String(body.categoryKey).trim().slice(0, 64) : null,
    linkPath: body.linkPath ? String(body.linkPath).trim().slice(0, 500) : null,
    priority: Number(body.priority) || 0,
    reviewedAt: new Date(),
    reviewedBy: new mongoose.Types.ObjectId(req.user!.id)
  });

  res.status(201).json({
    promotion: {
      id: doc._id.toString(),
      kind: doc.kind,
      reviewStatus: doc.reviewStatus
    }
  });
});
