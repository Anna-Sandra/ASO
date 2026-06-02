import { formatGhc } from "utils/money";
import { isFoodCallToOrderCategory, usesRequestInsteadOfCart } from "config/catalog";
import { buyerDisplayPrice } from "utils/checkoutPricing";

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

/** @param {Record<string, unknown> | null | undefined} [pricingOpts] From {@link useCheckoutPricingOptions}. */
export function productFeedPriceLabel(product, pricingOpts) {
  if (!product) return "";
  if (usesRequestInsteadOfCart(product)) {
    return isFoodCallToOrderCategory(product) ? "Buy" : "Quote";
  }
  return formatGhc(buyerDisplayPrice(Number(product.price), pricingOpts, 1));
}

/** Labels for ETA / delivery fee ribbons on catalog tiles (store + prep time). */
export function productTileDeliveryHints(product) {
  if (!product) return [];
  const store = product.store;
  const prep = Number(product.prepTimeMinutes);
  const out = [];
  if (Number.isFinite(prep) && prep > 0) {
    out.push({ key: "prep", label: `~${Math.round(prep)} min` });
  } else if (store?.businessType === "food_restaurant") {
    out.push({ key: "eta", label: "10–30 min" });
  }
  const fee = store?.deliveryFeeGhs != null ? Number(store.deliveryFeeGhs) : null;
  if (store?.deliveryAvailable && fee != null && fee > 0) {
    out.push({ key: "fee", label: `${formatGhc(fee)} delivery` });
  }
  return out;
}

/** Real social proof from backend (`recentViewers`, `soldLast7Days`). */
export function productSocialProofLines(product) {
  if (!product) return [];
  const lines = [];
  const rv = Math.floor(Number(product.recentViewers) || 0);
  if (rv >= 3) lines.push({ key: "views", text: `${rv} viewed recently` });
  const sold = Math.floor(Number(product.soldLast7Days) || 0);
  if (sold >= 1) {
    lines.push({
      key: "sold",
      text: sold === 1 ? "1 sold this week" : `${sold} sold this week`
    });
  }
  const rc = Math.floor(Number(product.reviewCount) || 0);
  const avg = Number(product.reviewAvg);
  if (rc >= 3 && Number.isFinite(avg)) {
    lines.push({ key: "rating", text: `★ ${avg.toFixed(1)} (${rc})` });
  }
  return lines;
}
