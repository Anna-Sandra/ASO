import { formatGhc } from "utils/money";
import { isFoodCallToOrderCategory, isOfflineQuoteCategory } from "config/catalog";

/** Parent storefront for a menu item / listing (restaurant-first when a store exists). */
export function productStoreContext(product) {
  const store = product?.store;
  if (store && String(store.slug || "").trim()) {
    return {
      name: String(store.name || "").trim() || "Store",
      slug: String(store.slug).trim(),
      href: `/store/${encodeURIComponent(String(store.slug).trim())}`,
      logoUrl: store.logoUrl ? String(store.logoUrl) : null,
      isRestaurant: store.businessType === "food_restaurant",
      hasStore: true,
      sellerOnly: false
    };
  }
  const seller = product?.sellerPayment?.displayName;
  if (seller && String(seller).trim()) {
    return {
      name: String(seller).trim(),
      slug: null,
      href: null,
      logoUrl: null,
      isRestaurant: false,
      hasStore: false,
      sellerOnly: true
    };
  }
  return {
    name: "Seller",
    slug: null,
    href: null,
    logoUrl: null,
    isRestaurant: false,
    hasStore: false,
    sellerOnly: true
  };
}

export function productFeedPriceLabel(product) {
  if (!product) return "";
  if (isOfflineQuoteCategory(product) || isFoodCallToOrderCategory(product)) {
    return isFoodCallToOrderCategory(product) ? "Call to order" : "Quote";
  }
  const px = Number(product.price);
  return Number.isFinite(px) ? formatGhc(px) : "";
}
