import mongoose from "mongoose";
import { Business } from "../businesses/business.model";
import { Product } from "../products/product.model";

/** Listings without fixed online checkout — buyers contact the seller instead. */
export const OFFLINE_INQUIRY_PRODUCT_CATEGORIES = ["food_drinks", "services"] as const;

export type OfflineInquiryProductCategory = (typeof OFFLINE_INQUIRY_PRODUCT_CATEGORIES)[number];

export const OFFLINE_INQUIRY_BUSINESS_TYPES = ["food_restaurant", "service_provider"] as const;

export function isOfflineInquiryProductCategory(
  category: unknown
): category is OfflineInquiryProductCategory {
  return (
    category === "food_drinks" ||
    category === "services"
  );
}

export async function sellerEligibleForOfflineInquiries(
  sellerId: mongoose.Types.ObjectId
): Promise<boolean> {
  const hasStore = await Business.exists({
    ownerId: sellerId,
    businessType: { $in: [...OFFLINE_INQUIRY_BUSINESS_TYPES] }
  });
  if (hasStore) return true;
  return Boolean(
    await Product.exists({
      sellerId,
      status: "active",
      category: { $in: [...OFFLINE_INQUIRY_PRODUCT_CATEGORIES] }
    })
  );
}
