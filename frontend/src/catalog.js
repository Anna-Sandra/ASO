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

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "under20", label: "Under Ghc 20" }
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

/** @param {Record<string, unknown>} p */
export function productMatchesFilter(p, filId) {
  const tags = /** @type {string[]} */ (p.tags || []);
  if (filId === "all") return true;
  if (filId === "new") return tags.includes("new");
  if (filId === "under20") return Number(p.price) < 20;
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
