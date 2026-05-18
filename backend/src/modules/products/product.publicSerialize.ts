import mongoose from "mongoose";
import { User } from "../auth/user.model";
import { Business } from "../businesses/business.model";
import { getEffectiveCommissionPercent } from "../platform/platformSettings.service";
import { rewriteStoredMediaUrl } from "../../utils/publicMediaUrl";

export type PublicStoreRef = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  businessType: string;
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
    updatedAt: p.updatedAt
  };
}

export async function attachSellerPayments(products: Record<string, unknown>[]) {
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
    .select("_id displayName phone email bankName bankAccountNumber bankAccountName")
    .lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  return products.map((p) => {
    const base = toPublicProduct(p);
    const raw = p.sellerId;
    const sellerKey =
      raw instanceof mongoose.Types.ObjectId
        ? raw.toString()
        : raw != null && raw !== ""
          ? String(raw)
          : "";
    if (!sellerKey) return base;
    const su = byId.get(sellerKey);
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

function storeRefFromBusiness(b: {
  _id: mongoose.Types.ObjectId;
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  businessType?: string;
}): PublicStoreRef {
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
    businessType: String(b.businessType || "")
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
    .select("name slug logoUrl businessType")
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

export async function enrichPublicProducts(products: Record<string, unknown>[]) {
  const withSeller = await attachSellerPayments(products);
  return attachStoreToProducts(withSeller);
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
