import type { Request } from "express";
import { env } from "../../config/env";
import { Product, type ProductCategory } from "../products/product.model";
import { Business } from "../businesses/business.model";
import {
  activeStoreBusinessIds,
  enrichPublicProducts,
  foodMenuStoreFilter
} from "../products/product.publicSerialize";

const FOOD_KEYWORDS =
  /\b(food|eat|eating|hungry|menu|dish|dishes|restaurant|cafeteria|canteen|waakye|banku|fufu|kenkey|jollof|lunch|dinner|breakfast|brunch|snack|order food|what.?s good)\b/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function userWantsFoodSuggestions(message: string): boolean {
  return FOOD_KEYWORDS.test(String(message || ""));
}

/** Parse GHS budget / range from free text (commas, k = thousand, "under X", ranges). */
export function parseGhsPriceConstraint(message: string): { min: number; max: number } | null {
  const raw = String(message || "").replace(/,/g, "");
  const parseNum = (s: string): number => {
    const t = s.trim().toLowerCase().replace(/\s+/g, "");
    if (/k$/i.test(t)) return Math.round(parseFloat(t.replace(/k$/i, "")) * 1000);
    const n = parseFloat(t.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };

  const between = raw.match(
    /\b(?:between|from)\s+([\d.]+\s*k?)\s+(?:and|to|[-–])\s+([\d.]+\s*k?)\b/i
  );
  if (between) {
    const a = parseNum(between[1]);
    const b = parseNum(between[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }

  const dash = raw.match(/\b(\d+(?:\.\d+)?\s*k?)\s+[-–]\s+(\d+(?:\.\d+)?\s*k?)\b/i);
  if (dash) {
    const a = parseNum(dash[1]);
    const b = parseNum(dash[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }

  const under = raw.match(/\b(?:under|below|less than|max|up to|upto)\s+(\d+(?:\.\d+)?\s*k?)\b/i);
  if (under) {
    const m = parseNum(under[1]);
    if (Number.isFinite(m) && m > 0) return { min: 0, max: m };
  }

  const over = raw.match(/\b(?:over|above|more than|at least|from)\s+(\d+(?:\.\d+)?\s*k?)\b/i);
  if (over) {
    const m = parseNum(over[1]);
    if (Number.isFinite(m) && m > 0) return { min: m, max: Number.POSITIVE_INFINITY };
  }

  return null;
}

/** When true, do not fill with unrelated “latest in category” if text search finds nothing. */
export function shouldUseNoCategoryFallback(message: string): boolean {
  const t = String(message || "").trim();
  if (parseGhsPriceConstraint(t)) return true;
  const shoppingCue = /\b(want|need|looking|show\s*me|find|buy|get|budget|price|affordable|cheap|within|range|recommend)\b/i;
  const specific =
    /\b(laptop|notebooks?|macbook|chromebook|desktops?|pc\b|monitor|printer|iphone|samsung|pixel\b|smartphone|phones?|tablets?|ipads?|headphones?|earbuds?|speakers?|cameras?|lenses?|routers?|cables?|chargers?|fridges?|freezers?|washing machines?|\b(?:washing machine)\b|tv\b|televisions?|microwaves?)\b/i;
  if (specific.test(t) && shoppingCue.test(t)) return true;
  return false;
}

function filterByPriceConstraint(
  rows: Record<string, unknown>[],
  constraint: { min: number; max: number } | null
): Record<string, unknown>[] {
  if (!constraint || !rows.length) return rows;
  const { min, max } = constraint;
  return rows.filter((r) => {
    const cat = String((r as { category?: string }).category || "");
    if (cat === "food_drinks" || cat === "services") return true;
    const p = Number((r as { price?: unknown }).price);
    if (!Number.isFinite(p)) return false;
    if (Number.isFinite(max) && max !== Number.POSITIVE_INFINITY && p > max) return false;
    if (p < min) return false;
    return true;
  });
}

/** Map casual shopper language to our catalog category (narrow fallback results). */
export function detectCategoryFromMessage(message: string): ProductCategory | null {
  const m = String(message || "").toLowerCase();
  if (/shoe|heel|boot|sandal|footwear|sneaker|trainer|slipper/.test(m)) return "fashion_accessories";
  if (/food|eat|eating|hungry|menu|dish|dishes|restaurant|cafeteria|waakye|jollof|fufu|snack\b/.test(m)) return "food_drinks";
  if (/electronic|gadget|laptop|phone|charger|cable|earbud|headphone|tablet/.test(m)) return "electronics_gadgets";
  if (/beauty|makeup|skin|hair|perfume|cosmetic|lipstick/.test(m)) return "beauty_personal_care";
  if (/\bbaby|babies|infant|infants|newborn|nursery|stroller|pram|crib|diaper|nappy|teether|bodysuit|onesie\b/.test(m))
    return "babies_infants";
  if (/\bbook|novel|textbook|course ?book\b/.test(m)) return "books_academic";
  if (/service|repair|fix|tutor|plumb|electrician|hire\b/.test(m)) return "services";
  if (/grocery|groceries|vegetable|fruit\b|essentials\b/.test(m)) return "groceries_essentials";
  if (/fashion|cloth|dress|shirt|pant|skirt|bag|purse|wallet|jewelry|watch|belt|accessor/.test(m)) return "fashion_accessories";
  return null;
}

export async function findProductsForFallback(
  message: string,
  limit = 6,
  options?: { noCategoryFallback?: boolean }
): Promise<Record<string, unknown>[]> {
  const noCategoryFallback = Boolean(options?.noCategoryFallback);
  const activeIds = await activeStoreBusinessIds();
  const trimmed = String(message || "").trim();
  const detectedCategory = detectCategoryFromMessage(trimmed);
  const priceConstraint = parseGhsPriceConstraint(trimmed);

  const base: Record<string, unknown> = {
    status: "active",
    $or: [{ category: "services" }, { stock: { $gt: 0 } }, { category: "food_drinks" }],
    ...foodMenuStoreFilter(activeIds)
  };
  if (detectedCategory) {
    base.category = detectedCategory;
  }

  const preferFood = userWantsFoodSuggestions(trimmed);

  let rows: Record<string, unknown>[] = [];

  if (trimmed.length >= 2) {
    try {
      rows = (await Product.find({
        ...base,
        $text: { $search: trimmed }
      })
        .sort({ score: { $meta: "textScore" } })
        .limit(limit * 2)
        .lean()) as unknown as Record<string, unknown>[];
    } catch {
      /* no text index or bad query */
    }
    if (!rows.length) {
      const re = new RegExp(escapeRegex(trimmed.slice(0, 80)), "i");
      rows = (await Product.find({
        ...base,
        $or: [{ name: re }, { description: re }, { tags: re }]
      })
        .sort({ updatedAt: -1 })
        .limit(limit * 2)
        .lean()) as unknown as Record<string, unknown>[];
    }
  }

  rows = filterByPriceConstraint(rows, priceConstraint).slice(0, limit);

  if (!rows.length && !noCategoryFallback) {
    const catFilter =
      detectedCategory != null
        ? {}
        : preferFood
          ? { category: "food_drinks" as const }
          : {};
    const broad = (await Product.find({ ...base, ...catFilter })
      .sort({ updatedAt: -1 })
      .limit(limit * 2)
      .lean()) as unknown as Record<string, unknown>[];
    rows = filterByPriceConstraint(broad, priceConstraint).slice(0, limit);
  }

  return enrichPublicProducts(rows);
}

function trimAppOrigin(origin: string): string {
  return String(origin || "").replace(/\/$/, "");
}

/** Markdown line for catalog/fallback replies — product and store links are always absolute (APP_ORIGIN). */
export function formatProductLine(
  p: Record<string, unknown> & { store?: { name?: string; slug?: string } },
  appOrigin: string
) {
  const origin = trimAppOrigin(appOrigin);
  const id = String(p.id || "");
  const name = String(p.name || "Item").trim() || "Item";
  const cat = String(p.category || "");
  const store = p.store;
  const storeBit =
    store?.slug && store?.name
      ? ` at [${String(store.name)}](${origin}/store/${encodeURIComponent(String(store.slug))})`
      : "";
  const price =
    cat === "food_drinks"
      ? "call to order"
      : cat === "services"
        ? "request a quote"
        : `GHS ${Number(p.price) || 0}`;
  const prefix = cat === "food_drinks" ? "🍽️ " : "";
  return `- ${prefix}[${name}](${origin}/products/${id})${storeBit} — ${price}`;
}

function isGreetingOnly(message: string): boolean {
  const t = String(message || "").trim();
  if (!t.length || t.length > 48) return false;
  if (
    /^(hi|hello|hey|hiya|howdy|sup|yo|good morning|good afternoon|good evening)\b[\s!,?.]*(there\b)?[\s!?.]*$/i.test(t)
  )
    return true;
  if (/^(what'?s up|whats up)\b[!?.]*$/i.test(t)) return true;
  return false;
}

/** Substring present only in the long pay/checkout reply — used to shorten on repeat asks. */
const ORDER_HELP_FULL_MARKER = "🛍️ Most products (you see a price + Buy):";

/** "How do I order", typos like "how to oder", checkout help, etc. */
const ORDER_HELP_INTENT =
  /\b(how\s+(do|to|can)\s+(i|you|we)\s+)?(order|buy|purchase|checkout|pay|cart)|\bhow\s+to\s+order|\bwhere\s+(do\s+i|can\s+i)\s+(order|buy|checkout)|\boder\b|i\s+want\s+to\s+(order|buy)/i;

type ChatTurn = { role: "user" | "assistant"; content: string };

function lastAssistantFromHistory(history: ChatTurn[] | undefined): string | null {
  if (!history?.length) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") return history[i].content;
  }
  return null;
}

/** Single source of truth for order / payment / guest checkout (fallback when no LLM or LLM empty). */
function markdownOrderHelpFull(siteName: string): string {
  return (
    `💳 How to pay on ${siteName}\n\n` +
      `${ORDER_HELP_FULL_MARKER}\n` +
      `1. 🛒 Tap Buy on the product you want (no account needed; it goes to your cart).\n` +
      `2. 🧺 Open Cart (cart button / drawer).\n` +
      `3. 📋 Tap Checkout and enter your email and phone — guest checkout is fine.\n` +
      `4. 💳 Pay with Paystack on the checkout screen.\n\n` +
      `🍽️ Food (call-to-order): open the dish → Place Order or call to order — seller details are on that page.\n\n` +
      `📩 Services (quotes): open the listing → Send request / the inquiry form (sign-in may be required).\n\n` +
      `🔓 Signing in is optional — useful for order history and messaging.\n\n` +
      `Want ideas? Browse or search from the home page. 🛒`
  );
}

/** Shorter reply when the shopper asks the same payment/order question again (avoids copy-paste duplication). */
function markdownOrderHelpRepeat(siteName: string): string {
  return (
    `⏩ Quick reminder on ${siteName}: 🛒 Buy → 🧺 Cart → 📋 Checkout → 💳 Paystack. ` +
      `🍽️ Call-to-order food: Place Order on the listing. 📩 Services: Send request. Anything specific? 🛒`
  );
}

/** One-line tip appended to generic listing fallbacks — keep aligned with `markdownOrderHelpFull`. */
function markdownOrderingTipLine(): string {
  return (
    "💡 Ordering tip: Priced items — 🛒 Buy → 🧺 Cart → 📋 Checkout → 💳 Paystack (guest OK). " +
      "🍽️ Food — Place Order / call to order on the listing. 📩 Services — Send request."
  );
}

/** Where to find seller phone / contact — avoid matching generic words like "message" or "seller" alone. */
const CONTACT_VENDOR_HELP =
  /\b(contact|phone|whatsapp|vendor|reach\s+out|get\s+in\s+touch|talk\s+to)|\bwhere\s+(do\s+i|can\s+i|to)\s+(contact|call|find|reach)|\bhow\s+(do\s+i|to)\s+(contact|reach|call)|contact\s+(the\s+)?(seller|vendor|store)|the\s+seller|seller\s+(details|contact|phone|number)|\bcall\s+the\s+(seller|vendor|restaurant)/i;

/** Optional hub path for discoverability (aligned with marketplace routes). */
function categorySearchHint(cat: ReturnType<typeof detectCategoryFromMessage>): string {
  const pathByCat: Partial<Record<string, string>> = {
    electronics_gadgets: "/electronics",
    fashion_accessories: "/fashion",
    food_drinks: "/food",
    beauty_personal_care: "/beauty",
    babies_infants: "/babies",
    groceries_essentials: "/groceries",
    books_academic: "/books",
    services: "/services"
  };
  const p = cat ? pathByCat[String(cat)] : "";
  if (p) return `Try **${p}** in the app or use search — new listings appear as vendors join.`;
  return "Try the category hubs on the home page or use search — new listings appear as vendors join.";
}

function noMatchReply(siteName: string, message: string): string {
  const cat = detectCategoryFromMessage(String(message || ""));
  return (
    `I don’t see any listings on ${siteName} that match what you asked for right now — the marketplace search didn’t return a matching product.\n\n` +
    `${categorySearchHint(cat)}\n\n` +
    markdownOrderingTipLine()
  );
}

/** User-friendly reply when Ollama is down, slow, or not configured — real listings, no dev jargon. */
export async function buildAssistantCatalogReply(
  siteName: string,
  message: string,
  _req: Request,
  history?: ChatTurn[]
): Promise<string> {
  const trimmed = String(message || "").trim();
  const strict = shouldUseNoCategoryFallback(trimmed);

  if (isGreetingOnly(trimmed)) {
    return (
      `Hey! 👋 I'm your 🏪 ${siteName} shopping assistant. Ask me about food, fashion, electronics, baby essentials, or any products — I'll find real listings for you!`
    );
  }

  if (ORDER_HELP_INTENT.test(trimmed)) {
    const prevAssistant = lastAssistantFromHistory(history);
    if (prevAssistant && prevAssistant.includes(ORDER_HELP_FULL_MARKER)) {
      return markdownOrderHelpRepeat(siteName);
    }
    return markdownOrderHelpFull(siteName);
  }

  if (CONTACT_VENDOR_HELP.test(trimmed)) {
    const products = await findProductsForFallback(message, 3, { noCategoryFallback: false });
    const appOrigin = trimAppOrigin(env.APP_ORIGIN);
    const exampleLines =
      products.length > 0
        ? [
            "",
            "📎 Example listings — open one and scroll for seller contact / payment details:",
            "",
            ...products.map((p) =>
              formatProductLine(p as Record<string, unknown> & { store?: { name?: string; slug?: string } }, appOrigin)
            )
          ]
        : [];

    return (
      `📞 Where to contact a vendor on ${siteName}\n\n` +
        `1. 📦 Open the product — seller **contact** (e.g. email) is on the listing when provided; food items use **call to order** / **Place Order** from the listing.\n` +
        `2. 🏪 Same store, more items — tap the store name link on a card to open that vendor’s storefront and menu.\n` +
        `3. 📬 After you buy (with an account), use Orders and Messages when chat is available — guests use the email and phone from checkout and details on the listing.\n` +
        exampleLines.join("\n")
    );
  }

  const products = await findProductsForFallback(message, 6, { noCategoryFallback: strict });
  const stores = await Business.find({ status: "active", businessType: "food_restaurant" })
    .sort({ updatedAt: -1 })
    .limit(4)
    .select("slug name")
    .lean();

  const appOrigin = trimAppOrigin(env.APP_ORIGIN);

  const food = userWantsFoodSuggestions(message);

  if (food && !products.length && stores.length) {
    const lines = [
      `I don’t see that exact dish or item in our current picks — here are some 🍽️ restaurants on ${siteName} you can open for full menus:`,
      "",
      ...stores.map((b) => {
        const slug = String(b.slug || "").trim();
        const name = String(b.name || "Store").trim();
        return slug
          ? `- [${name}](${appOrigin}/store/${encodeURIComponent(slug)}) — view menu`
          : `- ${name}`;
      }),
      "",
      markdownOrderingTipLine()
    ];
    return lines.join("\n");
  }

  if (!products.length && !stores.length) {
    if (strict) {
      return noMatchReply(siteName, message);
    }
    return (
      `I'm having trouble loading suggestions right now, but you can still browse ${siteName} from the home page. ` +
        `Try Food & drinks in the menu, or search. You can check out as a guest or sign in to track orders and message sellers when available.`
    );
  }

  if (!food && !products.length && strict) {
    return noMatchReply(siteName, message);
  }

  const parts: string[] = [];

  if (food) {
    parts.push(
      `Here are some 🍽️ food options on ${siteName} — each dish belongs to a restaurant; tap the name for details or the restaurant for the full menu:`
    );
  } else if (products.length) {
    parts.push(`Here are some listings on ${siteName} you can open right now:`);
  }

  if (products.length) {
    parts.push(
      "",
      ...products.map((p) =>
        formatProductLine(p as Record<string, unknown> & { store?: { name?: string; slug?: string } }, appOrigin)
      )
    );
  }

  if (food && stores.length && products.length) {
    parts.push(
      "",
      "🏪 More restaurants & stores:",
      ...stores.map((b) => {
        const slug = String(b.slug || "").trim();
        const name = String(b.name || "Store").trim();
        return slug
          ? `- [${name}](${appOrigin}/store/${encodeURIComponent(slug)}) — view full menu`
          : `- ${name}`;
      })
    );
  }

  parts.push("", markdownOrderingTipLine());

  return parts.join("\n");
}

export async function buildAssistantIdleReply(
  siteName: string,
  message: string,
  req: Request,
  history?: ChatTurn[]
): Promise<string> {
  return buildAssistantCatalogReply(siteName, message, req, history);
}
