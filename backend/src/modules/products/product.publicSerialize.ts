import mongoose from "mongoose";
import { User } from "../auth/user.model";
import { Business } from "../businesses/business.model";
import { Review } from "../reviews/review.model";
import { BuyerProductView } from "./buyerProductView.model";
import { Order } from "../orders/order.model";
import { getEffectiveCommissionPercent } from "../platform/platformSettings.service";
import { getOrCreateSettings } from "../platform/platformSettings.service";
import { rewriteStoredMediaUrl } from "../../utils/publicMediaUrl";
import type { ProductCategory } from "./product.model";
import { marketplaceSubcategoryLabel } from "./productSubcategories";
import { attachDealPricingToPublicProducts } from "../promotions/promotionDeal.service";
import { getVendorBillingSnapshot } from "../vendorSubscription/vendorSubscription.service";

export type PublicStoreRef = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  businessType: string;
  /** When set, storefront ETA / fee hints can use this (GHS). */
  deliveryFeeGhs?: number | null;
  deliveryAvailable?: boolean;
};

export function toPublicProduct(p: Record<string, unknown>) {
  const businessIdRaw = p.businessId;
  const menuSectionIdRaw = p.menuSectionId;
  const businessId =
    businessIdRaw instanceof mongoose.Types.ObjectId
      ? businessIdRaw.toString()
      : businessIdRaw != null
        ? String(businessIdRaw)
        : undefined;
  const menuSectionId =
    menuSectionIdRaw instanceof mongoose.Types.ObjectId
      ? menuSectionIdRaw.toString()
      : menuSectionIdRaw != null
        ? String(menuSectionIdRaw)
        : undefined;
  const oid = p._id;
  const id =
    oid instanceof mongoose.Types.ObjectId ? oid.toString() : oid != null && oid !== "" ? String(oid) : "";
  const sidRaw = p.sellerId;
  const sellerId =
    sidRaw instanceof mongoose.Types.ObjectId ? sidRaw.toString() : sidRaw != null && sidRaw !== "" ? String(sidRaw) : "";
  const pc = typeof p.category === "string" ? (p.category as ProductCategory) : ("food_drinks" as ProductCategory);
  const subRaw = typeof p.subcategory === "string" ? p.subcategory.trim() : "";
  const subcategory = subRaw || undefined;
  return {
    id,
    sellerId,
    ...(businessId ? { businessId } : {}),
    ...(menuSectionId ? { menuSectionId } : {}),
    ...(p.listingKind ? { listingKind: p.listingKind } : {}),
    ...(p.prepTimeMinutes != null ? { prepTimeMinutes: p.prepTimeMinutes } : {}),
    ...(Array.isArray(p.addons) && p.addons.length ? { addons: p.addons } : {}),
    name: p.name,
    description: p.description,
    category: p.category,
    ...(subcategory
      ? { subcategory, subcategoryLabel: marketplaceSubcategoryLabel(pc, subcategory) ?? subcategory.replace(/_/g, " ") }
      : {}),
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
    imageUrls: Array.isArray(p.imageUrls)
      ? (p.imageUrls as unknown[]).map((u) => (typeof u === "string" ? rewriteStoredMediaUrl(u) : u))
      : p.imageUrls,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    ...(() => {
      const st = Math.max(0, Math.floor(Number(p.stock) || 0));
      let stockHint: "out" | "critical" | "low" | "ok" = "ok";
      if (st <= 0) stockHint = "out";
      else if (st <= 2) stockHint = "critical";
      else if (st <= 10) stockHint = "low";
      return { stockHint };
    })()
  };
}

export type AttachSellerPaymentsOpts = {
  /**
   * When false (default), public buyers only see basic contact — not MoMo/bank used for Paystack payouts
   * (avoids buyers paying the vendor wallet directly). Set true for admin or the vendor’s own dashboard APIs.
   */
  includePayoutDetails?: boolean;
};

export async function attachSellerPayments(
  products: Record<string, unknown>[],
  opts?: AttachSellerPaymentsOpts
) {
  const includePayoutDetails = Boolean(opts?.includePayoutDetails);
  if (!products.length) return [];
  const commissionPercent = await getEffectiveCommissionPercent();
  const sellerIds = [
    ...new Set(
      products.map((p) => {
        const raw = p.sellerId;
        if (raw instanceof mongoose.Types.ObjectId) return raw.toString();
        if (raw != null && raw !== "") return String(raw);
        return "";
      }).filter(Boolean)
    )
  ];
  if (!sellerIds.length) {
    return products.map((p) => toPublicProduct(p));
  }
  const users = await User.find({
    _id: { $in: sellerIds.map((id) => new mongoose.Types.ObjectId(id)) }
  })
    .select(
      "_id role displayName phone email bankName bankAccountNumber bankAccountName vendorSubscriptionStatus vendorSubscriptionExempt vendorSubscriptionExpiresAt"
    )
    .lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  let visibleProducts = products;
  if (!includePayoutDetails) {
    const settings = await getOrCreateSettings();
    const blockedSellerIds = new Set(
      users
        .filter((u) => String((u as { role?: string }).role || "") === "seller")
        .filter((u) => !getVendorBillingSnapshot(u, settings).canOperate)
        .map((u) => u._id.toString())
    );
    if (blockedSellerIds.size > 0) {
      visibleProducts = products.filter((p) => {
        const raw = p.sellerId;
        const sid = raw instanceof mongoose.Types.ObjectId ? raw.toString() : raw != null ? String(raw) : "";
        return sid ? !blockedSellerIds.has(sid) : true;
      });
      if (!visibleProducts.length) return [];
    }
  }

  return visibleProducts.map((p) => {
    const base = toPublicProduct(p);
    const raw = p.sellerId;
    const sellerKey =
      raw instanceof mongoose.Types.ObjectId
        ? raw.toString()
        : raw != null && raw !== ""
          ? String(raw)
          : "";
    if (!sellerKey) return base;
    const suRaw = byId.get(sellerKey);
    if (!suRaw) return base;
    const su = suRaw as unknown as {
      displayName?: string;
      phone?: string;
      email?: string;
      bankName?: string;
      bankAccountNumber?: string;
      bankAccountName?: string;
    };
    const contactOnly = {
      displayName: String(su.displayName ?? "")
    };
    const full = {
      ...contactOnly,
      phone: String(su.phone ?? ""),
      bankName: String(su.bankName ?? ""),
      bankAccountNumber: String(su.bankAccountNumber ?? ""),
      bankAccountName: String(su.bankAccountName ?? "")
    };
    return {
      ...base,
      /** Service fee rate on the seller’s list price; fees are added for the buyer at checkout (v2 orders). */
      platformCommissionPercent: commissionPercent,
      sellerPayment: includePayoutDetails ? full : contactOnly
    };
  });
}

function storeRefFromBusiness(b: {
  _id: mongoose.Types.ObjectId;
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  businessType?: string;
  deliveryFee?: number | null;
  deliveryAvailable?: boolean;
}): PublicStoreRef {
  const df = b.deliveryFee;
  const feeNum = df != null && Number.isFinite(Number(df)) ? Number(df) : null;
  return {
    id: b._id.toString(),
    name: String(b.name || "").trim() || "Store",
    slug: String(b.slug || "").trim().toLowerCase(),
    logoUrl: (() => {
      const raw = b.logoUrl;
      if (raw == null) return null;
      const s = String(raw).trim();
      if (!s) return null;
      return rewriteStoredMediaUrl(s);
    })(),
    businessType: String(b.businessType || ""),
    deliveryAvailable: Boolean(b.deliveryAvailable),
    deliveryFeeGhs: feeNum != null && feeNum >= 0 ? feeNum : null
  };
}

/** Attach parent storefront (restaurant / store) for menu-style discovery feeds. */
export async function attachStoreToProducts<T extends Record<string, unknown>>(products: T[]): Promise<(T & { store?: PublicStoreRef })[]> {
  if (!products.length) return products;
  const bizIds = [
    ...new Set(
      products
        .map((p) => {
          const raw = p.businessId;
          if (raw instanceof mongoose.Types.ObjectId) return raw.toString();
          return raw != null && String(raw).trim() ? String(raw).trim() : "";
        })
        .filter(Boolean)
    )
  ];
  if (!bizIds.length) return products;
  const businesses = await Business.find({
    _id: { $in: bizIds.map((id) => new mongoose.Types.ObjectId(id)) },
    status: "active"
  })
    .select("name slug logoUrl businessType deliveryFee deliveryAvailable")
    .lean();
  const byId = new Map(businesses.map((b) => [b._id.toString(), storeRefFromBusiness(b)]));
  return products.map((p) => {
    const bid =
      p.businessId instanceof mongoose.Types.ObjectId
        ? p.businessId.toString()
        : p.businessId != null
          ? String(p.businessId)
          : "";
    const store = bid ? byId.get(bid) : undefined;
    return store ? { ...p, store } : p;
  });
}

/** Batch-attach average rating + count for discovery tiles (avoids N+1). */
async function attachReviewStats<T extends Record<string, unknown>>(products: T[]) {
  if (!products.length) return products;
  const ids = [
    ...new Set(
      products
        .map((p) => {
          const raw = (p as { id?: unknown }).id;
          return typeof raw === "string" && mongoose.isValidObjectId(raw) ? raw.trim() : "";
        })
        .filter(Boolean)
    )
  ] as string[];
  if (!ids.length) return products;
  type AggRow = { _id: mongoose.Types.ObjectId; avg?: number; n?: number };
  const aggRows: AggRow[] = await Review.aggregate<AggRow>([
    { $match: { productId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: "$productId", avg: { $avg: "$rating" }, n: { $sum: 1 } } }
  ]);
  const byId = new Map<string, { reviewAvg: number; reviewCount: number }>();
  for (const r of aggRows) {
    const n = Number(r.n) || 0;
    if (!n) continue;
    const avg = Math.round((Number(r.avg) || 0) * 10) / 10;
    byId.set(r._id.toString(), { reviewAvg: avg, reviewCount: n });
  }
  return products.map((p) => {
    const rawId = (p as { id?: unknown }).id;
    const id = typeof rawId === "string" ? rawId.trim() : "";
    const st = id ? byId.get(id) : undefined;
    if (!st) return p;
    return { ...p, reviewAvg: st.reviewAvg, reviewCount: st.reviewCount };
  });
}

const PAID_ORDER_STATUSES = ["paid", "processing", "sent_for_delivery", "delivered"] as const;

/** Real metrics for discovery tiles — recent views (24h) and units sold (7d). */
async function attachSocialProofStats<T extends Record<string, unknown>>(products: T[]) {
  if (!products.length) return products;
  const ids = [
    ...new Set(
      products
        .map((p) => {
          const raw = (p as { id?: unknown }).id;
          return typeof raw === "string" && mongoose.isValidObjectId(raw) ? raw.trim() : "";
        })
        .filter(Boolean)
    )
  ] as string[];
  if (!ids.length) return products;

  const sinceViews = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceSold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oidList = ids.map((id) => new mongoose.Types.ObjectId(id));

  type ViewAgg = { _id: mongoose.Types.ObjectId; c: number };
  const viewAgg: ViewAgg[] = await BuyerProductView.aggregate<ViewAgg>([
    { $match: { productId: { $in: oidList }, viewedAt: { $gte: sinceViews } } },
    { $group: { _id: "$productId", c: { $sum: 1 } } }
  ]);
  const viewersByPid = new Map(viewAgg.map((r) => [r._id.toString(), Number(r.c) || 0]));

  type SoldAgg = { _id: mongoose.Types.ObjectId; qty: number };
  const soldAgg: SoldAgg[] = await Order.aggregate<SoldAgg>([
    { $match: { status: { $in: [...PAID_ORDER_STATUSES] }, createdAt: { $gte: sinceSold } } },
    { $unwind: "$items" },
    { $match: { "items.productId": { $in: oidList } } },
    { $group: { _id: "$items.productId", qty: { $sum: "$items.quantity" } } }
  ]);
  const soldByPid = new Map(soldAgg.map((r) => [r._id.toString(), Math.max(0, Math.floor(Number(r.qty) || 0))]));

  return products.map((p) => {
    const rawId = (p as { id?: unknown }).id;
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id) return p;
    const recentViewers = viewersByPid.get(id) ?? 0;
    const soldLast7Days = soldByPid.get(id) ?? 0;
    return { ...p, recentViewers, soldLast7Days };
  });
}

export async function enrichPublicProducts(
  products: Record<string, unknown>[],
  opts?: AttachSellerPaymentsOpts
) {
  const withSeller = await attachSellerPayments(products, opts);
  const withStore = await attachStoreToProducts(withSeller);
  const withReviews = await attachReviewStats(withStore);
  const withSocial = await attachSocialProofStats(withReviews);
  return await attachDealPricingToPublicProducts(withSocial);
}

/** Live storefront ids — food linked only to these stores counts as “on a menu”. */
export async function activeStoreBusinessIds(): Promise<mongoose.Types.ObjectId[]> {
  return Business.find({ status: "active" }).distinct("_id");
}

/**
 * Public catalog food rule:
 * - show food on a live storefront menu, OR
 * - show food from sellers with no store (unlinked listings) so buyers can still discover & contact them.
 * Hide food tied only to draft / inactive / missing storefronts.
 */
export function foodMenuStoreFilter(activeIds: mongoose.Types.ObjectId[]): Record<string, unknown> {
  const foodVisible: Record<string, unknown>[] = [
    {
      category: "food_drinks",
      $or: [{ businessId: null }, { businessId: { $exists: false } }]
    }
  ];
  if (activeIds.length) {
    foodVisible.push({ category: "food_drinks", businessId: { $in: activeIds } });
  }
  return {
    $or: [{ category: { $ne: "food_drinks" } }, ...foodVisible]
  };
}
