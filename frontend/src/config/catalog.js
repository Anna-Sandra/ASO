export const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "food_drinks", label: "Food & Drinks" },
  { id: "fashion_accessories", label: "Fashion & Accessories" },
  { id: "electronics_gadgets", label: "Electronics & Gadgets" },
  { id: "beauty_personal_care", label: "Beauty & Personal Care" },
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
  "services",
  "books_academic",
  "groceries_essentials"
];

export const CATEGORY_LABELS = {
  food_drinks: "Food & Drinks",
  fashion_accessories: "Fashion & Accessories",
  electronics_gadgets: "Electronics & Gadgets",
  beauty_personal_care: "Beauty & Personal Care",
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
    case "grocery_store":
      return "groceries_essentials";
    case "academic_book":
      return "books_academic";
    case "service_provider":
    default:
      return "services";
  }
}

/** Fixed cart checkout prices are hidden for service listings — buyers arrange details with vendors. */
export function isServicesCategory(entity) {
  if (!entity || typeof entity !== "object") return false;
  return entity.category === "services";
}

/** Food & drinks — no guaranteed fixed price online; storefront shows “Call to order”. */
export function isFoodCallToOrderCategory(entity) {
  if (!entity || typeof entity !== "object") return false;
  return entity.category === "food_drinks";
}

/** Categories that skip cart / Paystack totals (quoted or called in). */
export function isOfflineQuoteCategory(entity) {
  return isServicesCategory(entity) || isFoodCallToOrderCategory(entity);
}

/**
 * “Notes for seller” (allergies, spice, extras, booking preferences) — only Food & Drinks and Services
 * listings use this; other categories use fixed listings without per-order buyer notes in cart.
 * @param {{ category?: string } | null | undefined} entity
 */
export function supportsCartCustomizationNotes(entity) {
  if (!entity || typeof entity !== "object") return false;
  const c = entity.category;
  return c === "food_drinks" || c === "services";
}


/** @param {Record<string, unknown>} p */
export function productMatchesFilter(p, filId) {
  const tags = /** @type {string[]} */ (p.tags || []);
  if (filId === "all") return true;
  if (filId === "new") return tags.includes("new");
  if (filId === "popular") return tags.includes("popular");
  
  return true;
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
 * Match checkout line math: `gross` is the vendor’s list line (unit × qty). Service fee is a percent of that;
 * `sellerReceives` equals `gross` (fees are on top for the buyer at checkout).
 */
export function splitLineBuyerPayment(unitPrice, quantity, platformCommissionPercent) {
  const raw = Number(platformCommissionPercent);
  const pct = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : DEFAULT_PLATFORM_COMMISSION_PERCENT;
  const rate = pct / 100;
  const gross = Math.round(Number(unitPrice) * Number(quantity) * 100) / 100;
  const platformFee = Math.round(gross * rate * 100) / 100;
  const sellerReceives = gross;
  return { gross, platformFee, sellerReceives, platformCommissionPercent: pct };
}

/** @param {{ price: number, qty?: number, platformCommissionPercent?: unknown }[]} items */
export function aggregateCartSplits(items) {
  let gross = 0;
  let platformFee = 0;
  for (const p of items) {
    const s = splitLineBuyerPayment(p.price, p.qty ?? 1, p.platformCommissionPercent);
    gross += s.gross;
    platformFee += s.platformFee;
  }
  gross = Math.round(gross * 100) / 100;
  platformFee = Math.round(platformFee * 100) / 100;
  const sellerReceives = gross;
  return { gross, platformFee, sellerReceives };
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
