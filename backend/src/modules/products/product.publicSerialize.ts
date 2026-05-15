import mongoose from "mongoose";
import { User } from "../auth/user.model";
import { getEffectiveCommissionPercent } from "../platform/platformSettings.service";

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
  return {
    id: (p._id as mongoose.Types.ObjectId).toString(),
    sellerId: (p.sellerId as mongoose.Types.ObjectId).toString(),
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
