import { calculateBuyerTotal } from "utils/checkoutPricing";

export const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "food_drinks", label: "Food & Drinks" },
  { id: "fashion_accessories", label: "Fashion & Accessories" },
  { id: "electronics_gadgets", label: "Electronics & Gadgets" },
  { id: "beauty_personal_care", label: "Beauty & Personal Care" },
  { id: "babies_infants", label: "Babies & Infants" },
  { id: "services", label: "Services" },
  { id: "books_academic", label: "Books & Academic Materials" },
  { id: "groceries_essentials", label: "Groceries & Essentials" }
];

/**
 * For any UI list of `{ id, label }` where `id === "all"` means “every category / whole list”,
 * ensure that row is first. Safe to call on lists that already have All first.
 * @param {{ id: string, label?: string }[]} rows
 */
export function withAllCategoryFirst(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const i = rows.findIndex((r) => r && r.id === "all");
  if (i <= 0) return rows;
  const next = rows.slice();
  const [allRow] = next.splice(i, 1);
  return [allRow, ...next];
}

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "popular", label: "Popular" }
];

export const PRODUCT_CATEGORY_VALUES = [
  "food_drinks",
  "fashion_accessories",
  "electronics_gadgets",
  "beauty_personal_care",
  "babies_infants",
  "services",
  "books_academic",
  "groceries_essentials"
];

export const CATEGORY_LABELS = {
  food_drinks: "Food & Drinks",
  fashion_accessories: "Fashion & Accessories",
  electronics_gadgets: "Electronics & Gadgets",
  beauty_personal_care: "Beauty & Personal Care",
  babies_infants: "Babies & Infants",
  services: "Services",
  books_academic: "Books & Academic Materials",
  groceries_essentials: "Groceries & Essentials"
};

/** Restaurant storefronts use menu sections; other store types use a flat listings grid. */
export function storeUsesMenuSections(businessType) {
  return businessType === "food_restaurant";
}

/** Marketplace category for listings on a store of this type (matches backend `primaryProductCategoryForBusinessType`). */
export function productCategoryForBusinessType(businessType) {
  switch (businessType) {
    case "food_restaurant":
      return "food_drinks";
    case "fashion_store":
      return "fashion_accessories";
    case "electronics_shop":
      return "electronics_gadgets";
    case "beauty_shop":
      return "beauty_personal_care";
    case "baby_infant_store":
      return "babies_infants";
    case "grocery_store":
      return "groceries_essentials";
    case "academic_book":
      return "books_academic";
    case "service_provider":
    default:
      return "services";
  }
}

/** Service listings (`category === "services"`). */
export function isServicesCategory(entity) {
  if (!entity || typeof entity !== "object") return false;
  return entity.category === "services";
}

/** Legacy: food used call-to-order. Listings now use real prices — keep helper for compatibility (always false). */
export function isFoodCallToOrderCategory() {
  return false;
}

/**
 * Categories that skip cart checkout (quote / contact only). Food & services now use listed prices.
 */
export function isOfflineQuoteCategory() {
  return false;
}

/**
 * Per-order buyer notes in cart — food, services, or any listing with vendor-defined add-ons.
 * @param {{ category?: string, addons?: unknown[] } | null | undefined} entity
 */
export function supportsCartCustomizationNotes(entity) {
  if (!entity || typeof entity !== "object") return false;
  const c = entity.category;
  if (c === "food_drinks" || c === "services") return true;
  return Array.isArray(entity.addons) && entity.addons.length > 0;
}


/** @param {Record<string, unknown>} p */
export function productMatchesFilter(p, filId) {
  const tags = /** @type {string[]} */ (p.tags || []);
  if (filId === "all") return true;
  if (filId === "new") return tags.includes("new");
  if (filId === "popular") return tags.includes("popular");
  
  return true;
}

/**
 * Narrows the product list to listings whose name, description, or tags contain every search word
 * (case-insensitive). Used on the shop so a query like “running shoes” only shows matching items.
 * @param {Record<string, unknown>} p
 * @param {string} query
 */
export function productMatchesSearchTerms(p, query) {
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return true;
  const terms = raw.split(/\s+/).filter((t) => t.length > 0);
  if (!terms.length) return true;
  const blob = [
    String(p.name || ""),
    String(p.description || ""),
    ...(Array.isArray(p.tags) ? p.tags.map((x) => String(x)) : [])
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => blob.includes(t));
}

/** @param {string} id */
export function refFromId(id) {
  let x = 0;
  for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) >>> 0;
  return (x % 59) + 1;
}

/** @param {Record<string, unknown>} p */
export function productBadge(p) {
  const tags = /** @type {string[]} */ (p.tags || []);
  if (tags.includes("new")) return "New";
  if (tags.includes("sale")) return "Sale";
  return null;
}

/**
 * Decorative promo chips for storefront cards (tags + compare-at pricing).
 * @param {Record<string, unknown>} p
 * @returns {Array<{ key: string; label: string; className: string }>}
 */
export function productStorefrontBadges(p) {
  /** @type {Array<{ key: string; label: string; className: string }>} */
  const out = [];
  const tags = /** @type {string[]} */ ((p.tags || []).map((t) => String(t || "").toLowerCase()));

  const ad = p.activeDeal && typeof p.activeDeal === "object" ? p.activeDeal : null;
  if (ad) {
    const kind = String(ad.kind || "");
    const tb = String(ad.tagBadge || "").trim();
    const label =
      kind === "flash_sale"
        ? tb
          ? `🔥 ${tb.slice(0, 22)}`
          : "🔥 FLASH SALE"
        : kind === "deal_bundle"
          ? tb
            ? `🎁 ${tb.slice(0, 22)}`
            : "🎁 BUNDLE"
          : tb
            ? `💰 ${tb.slice(0, 22)}`
            : "💰 SALE";
    out.push({ key: "deal-chip", label, className: "bg-rose-600 text-white ring-rose-950/40" });
  }

  const list = Number(p.price);
  const cmpRaw = Number(p.compareAtPrice);
  if (Number.isFinite(cmpRaw) && Number.isFinite(list) && cmpRaw > list && list > 0) {
    const pct = Math.round(((cmpRaw - list) / cmpRaw) * 100);
    if (pct > 0 && pct < 100) {
      out.push({ key: "off", label: `${pct}% OFF`, className: "bg-fuchsia-500 text-white" });
    }
  }

  if (tags.includes("popular")) out.push({ key: "popular", label: "Popular", className: "bg-orange-500 text-white" });

  const pb = productBadge(p);
  if (pb === "New") out.push({ key: "new", label: "New", className: "bg-emerald-500 text-white" });
  else if (pb === "Sale" && !out.some((x) => x.key === "off")) out.push({ key: "sale", label: "Sale", className: "bg-rose-500 text-white" });

  const seen = new Set();
  return out.filter((b) => (seen.has(b.label) ? false : (seen.add(b.label), true))).slice(0, 3);
}

/** @param {Record<string, unknown>} sp */
export function formatSellerPaymentSnippet(sp) {
  if (!sp || typeof sp !== "object") return "";
  const phone = String(sp.phone || "").trim();
  const bank =
    [sp.bankName, sp.bankAccountName, sp.bankAccountNumber].map((x) => String(x || "").trim()).filter(Boolean).join(" · ") ||
    "";
  const parts = [];
  if (phone) parts.push(`MoMo: ${phone}`);
  if (bank) parts.push(`Bank: ${bank}`);
  return parts.join(" · ");
}

/** Default platform commission if product payload predates API field. */
export const DEFAULT_PLATFORM_COMMISSION_PERCENT = 5;

/**
 * Seller nets list price × qty; buyer pays all fees on top (whole GHS).
 * @param {{ paystackFeePercent?: number, paystackFeeFixedGhs?: number } | null | undefined} [paystackOpts]
 */
export function splitLineBuyerPayment(unitPrice, quantity, platformCommissionPercent, paystackOpts) {
  const raw = Number(platformCommissionPercent);
  const pct = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : DEFAULT_PLATFORM_COMMISSION_PERCENT;
  const sellerReceives = Math.ceil((Number(unitPrice) || 0) * (Number(quantity) || 1));
  const paystackPct = Number(paystackOpts?.paystackFeePercent);
  const paystackFixed = Number(paystackOpts?.paystackFeeFixedGhs) || 0;
  const buyerTotal =
    Number.isFinite(paystackPct) && paystackPct >= 0
      ? calculateBuyerTotal(sellerReceives, pct, paystackPct, paystackFixed)
      : sellerReceives;
  const platformFee = Math.ceil(sellerReceives * (pct / 100));
  const paystackFee = Math.max(0, buyerTotal - sellerReceives - platformFee);
  return {
    gross: sellerReceives,
    platformFee,
    paystackFee,
    buyerTotal,
    sellerReceives,
    platformCommissionPercent: pct
  };
}

/** @param {{ price: number, qty?: number, platformCommissionPercent?: unknown }[]} items */
export function aggregateCartSplits(items, paystackOpts) {
  let sellerReceives = 0;
  let buyerTotal = 0;
  let platformFee = 0;
  for (const p of items) {
    const s = splitLineBuyerPayment(p.price, p.qty ?? 1, p.platformCommissionPercent, paystackOpts);
    sellerReceives += s.sellerReceives;
    buyerTotal += s.buyerTotal;
    platformFee += s.platformFee;
  }
  return {
    gross: Math.ceil(sellerReceives),
    platformFee: Math.ceil(platformFee),
    sellerReceives: Math.ceil(sellerReceives),
    buyerTotal: Math.ceil(buyerTotal)
  };
}

/** @param {{ sellerId?: string, sellerPayment?: Record<string, unknown> }[]} items */
export function groupCartItemsBySeller(items) {
  /** @type {Map<string, { sellerId: string, sellerPayment: Record<string, unknown> | null, items: typeof items }>} */
  const m = new Map();
  for (const p of items) {
    const sid = String(p.sellerId || "unknown");
    if (!m.has(sid)) {
      m.set(sid, { sellerId: sid, sellerPayment: p.sellerPayment && typeof p.sellerPayment === "object" ? p.sellerPayment : null, items: [] });
    }
    m.get(sid).items.push(p);
  }
  return [...m.values()];
}

/** Seller’s share for a group of cart lines (same math as checkout order lines). */
export function sellerGroupSellerReceives(groupItems) {
  let s = 0;
  for (const p of groupItems) {
    s += splitLineBuyerPayment(p.price, p.qty ?? 1, p.platformCommissionPercent).sellerReceives;
  }
  return Math.round(s * 100) / 100;
}

/** List-price total for a seller’s cart lines (vendor listing subtotal; buyer sees extra fees at checkout). */
export function sellerGroupGross(groupItems) {
  let s = 0;
  for (const p of groupItems) {
    s += Number(p.price) * (p.qty ?? 1);
  }
  return Math.round(s * 100) / 100;
}
