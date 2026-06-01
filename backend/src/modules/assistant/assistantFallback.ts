import type { Request } from "express";
import { DEFAULT_SITE_NAME } from "../../config/brand";
import { env } from "../../config/env";
import type { ProductCategory } from "../products/product.model";
import { Business } from "../businesses/business.model";
import {
  detectCategoryFromMessage,
  extractSearchIntent,
  messageHasShoppingIntent,
  queryLabelFromMessage,
  searchProductsForAssistant,
  searchSimilarProductsForAssistant
} from "./assistantSearch";

export { detectCategoryFromMessage };

const FOOD_KEYWORDS =
  /\b(food|eat|eating|hungry|menu|dish|dishes|restaurant|cafeteria|canteen|waakye|banku|fufu|kenkey|jollof|fried\s*rice|friedrice|rice|noodles|lunch|dinner|breakfast|brunch|snack|order food|what.?s good)\b/i;

const SHORT_AFFIRMATIVE =
  /^(yes|yeah|yep|yup|sure|ok|okay|please|show\s*(me|them)?|go\s*ahead)\s*[!?.]*$/i;

function userWantsFoodSuggestions(message: string): boolean {
  return FOOD_KEYWORDS.test(String(message || ""));
}

function trimAppOrigin(origin: string): string {
  return String(origin || "").replace(/\/$/, "");
}

function marketplaceOrigin(): string {
  return trimAppOrigin(env.APP_ORIGIN);
}

function categoryEmoji(cat: ProductCategory | null, food = false): string {
  if (food) return "🍛";
  switch (cat) {
    case "fashion_accessories":
      return "👖";
    case "food_drinks":
      return "🍛";
    case "electronics_gadgets":
      return "📱";
    case "beauty_personal_care":
      return "💄";
    case "babies_infants":
      return "👶";
    case "groceries_essentials":
      return "🛒";
    case "books_academic":
      return "📚";
    case "services":
      return "🛠️";
    default:
      return "✨";
  }
}

/** Shared tone rules for Groq/Ollama shopping assistant prompts. */
export function assistantConversationalToneRules(): string {
  return `CONVERSATIONAL TONE (critical):
- Sound like a friendly local shopping assistant helping someone find products and food nearby — not a database search engine
- Acknowledge what they asked for in natural language (use their words: "green jeans", "fried rice", etc.)
- Avoid robotic openers every time — do NOT repeat "I don't see..." or "No results found"; prefer "Sorry, I couldn't find any [item] available right now" or "I couldn't find any [item] right now"
- If something isn't listed, apologize briefly, then suggest relevant alternatives, colors, dishes, or category browsing
- Ask ONE short, helpful follow-up when it fits (e.g. "Would you like other rice dishes or restaurants listed right now?")
- Keep replies short, warm, and useful — usually 2–4 short blocks, not a wall of system text
- Do NOT paste checkout/cart/Paystack instructions after a simple search — only explain ordering when they ask how to buy, pay, or check out
- Use one fitting emoji at the start (👖 fashion, 🍛 food, 📱 electronics) — sparingly elsewhere
- Only cite real listings from the Listings section below — never invent products, stores, or GHS prices
- Do not use markdown bold — no asterisks (never write **like this**); plain text only
- List products one per line as "[Name](url) at [Store](url) · GHS price" — no bullet dashes (-), no em dashes (—), no blank lines between product name and store`;
}

/** Store name as a single link — no dash prefix, no "view menu" suffix. */
/** Remove `**bold**` so shopper-facing text stays plain. */
export function stripMarkdownBold(text: string): string {
  return String(text || "").replace(/\*\*([^*]+)\*\*/g, "$1");
}

/** Plain, shopper-facing assistant text (no bold, no "— view menu", no orphan bullets). */
export function normalizeAssistantReply(text: string): string {
  let t = stripMarkdownBold(String(text || ""));
  t = t.replace(/\s*[—–-]\s*view\s+(?:full\s+)?menu/gi, "");
  t = t.replace(/^\s*-\s*\n+/gm, "");
  t = t.replace(/\n\s*[—–-]\s*view\s+(?:full\s+)?menu\s*/gi, "\n");
  t = t.replace(/^\s*-\s+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/\s+—\s+/g, " · ");
  return t.trim();
}

function lastUserMessageFromHistory(history: ChatTurn[] | undefined): string | null {
  if (!history?.length) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return String(history[i].content || "").trim();
  }
  return null;
}

async function foodRestaurantsSuggestReply(
  siteName: string,
  message: string,
  limit = 4
): Promise<string | null> {
  const stores = await Business.find({ status: "active", businessType: "food_restaurant" })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select("slug name")
    .lean();
  if (!stores.length) return null;
  const origin = marketplaceOrigin();
  const dish = queryLabelFromMessage(message) || "that dish";
  const lines = [
    `🍛 Sorry, I couldn't find ${dish} available on ${siteName} right now.`,
    "",
    "These restaurants have menus you can browse:",
    "",
    ...stores.map((b) => formatStoreLine(String(b.name || "Store"), String(b.slug || "").trim() || undefined, origin)),
    "",
    "Would you like me to show other rice dishes or restaurants listed right now?"
  ];
  return normalizeAssistantReply(lines.join("\n"));
}

export function formatStoreLine(name: string, slug: string | undefined, origin: string): string {
  const n = String(name || "Store").trim() || "Store";
  const s = String(slug || "").trim();
  const base = trimAppOrigin(origin);
  if (!s) return n;
  return `[${n}](${base}/store/${encodeURIComponent(s)})`;
}

function foodDishAlternativesText(message: string, origin: string): string {
  const m = String(message || "").toLowerCase();
  if (/fried\s*rice|chinese\s*rice/.test(m)) {
    return `You can browse [Food & drinks](${origin}/food) or try searching for jollof rice, waakye, Chinese rice, or noodles.`;
  }
  if (/\brice\b/.test(m)) {
    return `Try [Food & drinks](${origin}/food) or search for jollof rice, waakye, fried rice, or noodles.`;
  }
  return `Browse [Food & drinks](${origin}/food) or use search to see meals listed today.`;
}

function fashionColorAlternativesText(message: string): string | null {
  if (!/\bgreen\b/.test(String(message || "").toLowerCase())) return null;
  return "If you'd like, I can also help you look for similar colors like olive, khaki, army green, or dark denim.";
}

function categoryBrowseLine(cat: ReturnType<typeof detectCategoryFromMessage>, origin: string): string {
  const hubs: Partial<Record<string, { path: string; label: string }>> = {
    electronics_gadgets: { path: "/electronics", label: "Electronics" },
    fashion_accessories: { path: "/fashion", label: "Fashion" },
    food_drinks: { path: "/food", label: "Food & drinks" },
    beauty_personal_care: { path: "/beauty", label: "Beauty" },
    babies_infants: { path: "/babies", label: "Baby & kids" },
    groceries_essentials: { path: "/groceries", label: "Groceries" },
    books_academic: { path: "/books", label: "Books" },
    services: { path: "/services", label: "Services" }
  };
  const hub = cat ? hubs[String(cat)] : null;
  if (hub) {
    return `Browse [${hub.label}](${origin}${hub.path}) or use search — new listings appear as sellers join.`;
  }
  return "Browse from the home page or use search — new sellers join regularly.";
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
  if (messageHasShoppingIntent(t)) return true;
  const shoppingCue = /\b(want|need|looking|show\s*me|find|buy|get|budget|price|affordable|cheap|within|range|recommend)\b/i;
  const specific =
    /\b(laptop|notebooks?|macbook|chromebook|desktops?|pc\b|monitor|printer|iphone|samsung|pixel\b|smartphone|phones?|tablets?|ipads?|headphones?|earbuds?|speakers?|cameras?|lenses?|routers?|cables?|chargers?|fridges?|freezers?|washing machines?|\b(?:washing machine)\b|tv\b|televisions?|microwaves?|toothbrush(?:es)?|toothpaste|deodorant|shampoo|conditioner|razor|soap)\b/i;
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

export type AssistantFallbackProducts = {
  kind: "exact" | "similar" | "none";
  products: Record<string, unknown>[];
};

/** Product-style questions (e.g. “green jeans”) — never use random listings or LLM invention. */
export function isStrictProductSearch(message: string): boolean {
  const t = String(message || "").trim();
  return shouldUseNoCategoryFallback(t) && !userWantsFoodSuggestions(t);
}

/** Food + specific product searches use catalog copy only (Groq invents wrong store lines). */
export function isCatalogDrivenQuery(message: string, history?: ChatTurn[]): boolean {
  const t = String(message || "").trim();
  if (!t) return false;
  if (isStrictProductSearch(t) || userWantsFoodSuggestions(t)) return true;
  if (messageHasShoppingIntent(t)) return true;
  if (/\b(i|we)\s+(need|want|get|buy|looking\s+for)\b/i.test(t)) return true;
  if (detectCategoryFromMessage(t)) return true;
  if (SHORT_AFFIRMATIVE.test(t) && history?.length) return true;
  return false;
}

export async function findProductsForFallback(
  message: string,
  limit = 6,
  options?: { noCategoryFallback?: boolean }
): Promise<AssistantFallbackProducts> {
  const exact = await searchProductsForAssistant(message, limit);
  if (exact.length > 0) return { kind: "exact", products: exact };

  const similar = await searchSimilarProductsForAssistant(message, limit);
  if (similar.length > 0) return { kind: "similar", products: similar };

  const noCategoryFallback = Boolean(options?.noCategoryFallback);
  if (noCategoryFallback) return { kind: "none", products: [] };

  const trimmed = String(message || "").trim();
  const priceConstraint = parseGhsPriceConstraint(trimmed);
  const preferFood = userWantsFoodSuggestions(trimmed);

  if (preferFood) {
    const broad = await searchProductsForAssistant("food lunch menu", limit);
    const filtered = filterByPriceConstraint(broad, priceConstraint).slice(0, limit);
    if (filtered.length > 0) return { kind: "exact", products: filtered };
  }

  return { kind: "none", products: [] };
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
      ? ` at ${formatStoreLine(String(store.name), String(store.slug), origin)}`
      : "";
  const price =
    cat === "food_drinks"
      ? "buy"
      : cat === "services"
        ? "request a quote"
        : `GHS ${Number(p.price) || 0}`;
  const prefix = cat === "food_drinks" ? "🍽️ " : "";
  return `${prefix}[${name}](${origin}/products/${id})${storeBit} · ${price}`;
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
      `🍽️ Food (buy): open the dish → buy — seller details are on that page.\n\n` +
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
      "🍽️ Food — buy on the listing. 📩 Services — Send request."
  );
}

const CORRECTION_INTENT =
  /\b(but\s+(you\s+)?(don'?t|do not)|that'?s\s+wrong|not\s+right|you\s+don'?t\s+have|these\s+products|those\s+products|wrong\s+products|not\s+listed)\b/i;

const FOLLOWUP_PRODUCT_HINT =
  /\b(but\s+(i\s+)?see|what\s+about|try\s+searching|how\s+about|look\s+for|search\s+for)\b/i;

function extractProductHintFromMessage(message: string): string | null {
  const t = String(message || "").trim();
  const seeMatch = t.match(/\b(?:but\s+)?(?:i\s+)?see\s+(.+?)(?:\?|\.|$)/i);
  if (seeMatch?.[1]) return seeMatch[1].trim();
  const aboutMatch = t.match(/\b(?:what\s+about|how\s+about|try)\s+(.+?)(?:\?|\.|$)/i);
  if (aboutMatch?.[1]) return aboutMatch[1].trim();
  return null;
}

/** Re-use prior product ask or inline hint when shopper pushes back or refines. */
export function resolveSearchMessage(message: string, history?: ChatTurn[]): string {
  const t = normalizeShoppingMessage(String(message || "").trim());
  if (!CORRECTION_INTENT.test(t) && !FOLLOWUP_PRODUCT_HINT.test(t)) return t;

  const hint = extractProductHintFromMessage(t);
  if (hint) return normalizeShoppingMessage(hint);

  if (history?.length) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role !== "user") continue;
      const prev = String(history[i].content || "").trim();
      if (!prev || prev === t) continue;
      if (messageHasShoppingIntent(prev) || detectCategoryFromMessage(prev)) {
        return normalizeShoppingMessage(prev);
      }
    }
  }
  return normalizeShoppingMessage(t);
}

/** Common typos and shorthand before catalog search. */
export function normalizeShoppingMessage(message: string): string {
  return String(message || "")
    .replace(/\bshoea\b/gi, "shoes")
    .replace(/\bshoee?s\b/gi, "shoes")
    .replace(/\bface\s+mask\b/gi, "face mask")
    .trim();
}

/** Where to find seller phone / contact — avoid matching generic words like "message" or "seller" alone. */
const CONTACT_VENDOR_HELP =
  /\b(contact|phone|whatsapp|vendor|reach\s+out|get\s+in\s+touch|talk\s+to)|\bwhere\s+(do\s+i|can\s+i|to)\s+(contact|call|find|reach)|\bhow\s+(do\s+i|to)\s+(contact|reach|call)|contact\s+(the\s+)?(seller|vendor|store)|the\s+seller|seller\s+(details|contact|phone|number)|\bcall\s+the\s+(seller|vendor|restaurant)/i;

function noMatchReply(siteName: string, message: string): string {
  const origin = marketplaceOrigin();
  const cat = detectCategoryFromMessage(String(message || ""));
  const intent = extractSearchIntent(message);
  const label = queryLabelFromMessage(message);
  const item = label || "that";
  const food = userWantsFoodSuggestions(message);

  if (food) {
    const dish = label || "that dish";
    const parts = [
      `🍛 Sorry, I couldn't find any ${dish} available on ${siteName} right now.`,
      "",
      foodDishAlternativesText(message, origin),
      "",
      "New food vendors join regularly, so more options may show up soon.",
      "",
      "Would you like me to show other rice dishes or restaurants that are listed right now?"
    ];
    return normalizeAssistantReply(parts.join("\n"));
  }

  if (intent.isFashion || cat === "fashion_accessories") {
    const parts = [
      `👖 I couldn't find any ${item} available right now.`,
      "",
      categoryBrowseLine(cat, origin),
      fashionColorAlternativesText(message)
    ].filter(Boolean);
    parts.push("", "Tell me another color or style and I'll look again.");
    return normalizeAssistantReply(parts.join("\n"));
  }

  const emoji = categoryEmoji(cat);
  return normalizeAssistantReply(
    [
      `${emoji} Sorry, I couldn't find any ${item} on ${siteName} right now.`,
      "",
      categoryBrowseLine(cat, origin),
      "",
      "Want me to try a different keyword or price range?"
    ].join("\n")
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
  const searchMessage = resolveSearchMessage(trimmed, history);
  const strict = shouldUseNoCategoryFallback(searchMessage);

  if (isGreetingOnly(trimmed)) {
    return (
      `Hey! 👋 I'm your ${siteName} shopping assistant — here to help you find food, fashion, electronics, and more from local sellers.\n\nWhat are you looking for today?`
    );
  }

  if (SHORT_AFFIRMATIVE.test(trimmed) && history?.length) {
    const prevUser = lastUserMessageFromHistory(history);
    if (prevUser && userWantsFoodSuggestions(prevUser)) {
      const again = await foodRestaurantsSuggestReply(siteName, prevUser);
      if (again) return again;
    }
    const lastAsst = lastAssistantFromHistory(history) || "";
    if (/restaurants|menus you can browse|NatEats/i.test(lastAsst) && prevUser) {
      const again = await foodRestaurantsSuggestReply(siteName, prevUser);
      if (again) {
        return normalizeAssistantReply(
          `Sure — here are those restaurants again:\n\n${again.split("\n\n").slice(2).join("\n\n")}`
        );
      }
    }
    return normalizeAssistantReply(
      `Happy to help — tell me what you're looking for (food, fashion, electronics, or a specific item) and I'll search the marketplace.`
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
    const { products } = await findProductsForFallback(message, 3, { noCategoryFallback: false });
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
        `1. 📦 Open the product — seller contact (e.g. email) is on the listing when provided; food items use buy from the listing.\n` +
        `2. 🏪 Same store, more items — tap the store name link on a card to open that vendor’s storefront and menu.\n` +
        `3. 📬 After you buy (with an account), use Orders and Messages when chat is available — guests use the email and phone from checkout and details on the listing.\n` +
        exampleLines.join("\n")
    );
  }

  const { kind, products } = await findProductsForFallback(searchMessage, 6, { noCategoryFallback: strict });
  const stores = await Business.find({ status: "active", businessType: "food_restaurant" })
    .sort({ updatedAt: -1 })
    .limit(4)
    .select("slug name")
    .lean();

  const origin = marketplaceOrigin();
  const intent = extractSearchIntent(searchMessage);
  const cat = detectCategoryFromMessage(searchMessage);
  const food = userWantsFoodSuggestions(searchMessage);

  if (food && !products.length && stores.length) {
    const again = await foodRestaurantsSuggestReply(siteName, searchMessage);
    if (again) return again;
  }

  if (!products.length && !stores.length) {
    if (strict) {
      return noMatchReply(siteName, searchMessage);
    }
    return (
      `I'm having trouble loading suggestions right now, but you can still browse ${siteName} from the home page. ` +
        `Try Food & drinks in the menu, or search. You can check out as a guest or sign in to track orders and message sellers when available.`
    );
  }

  if (!food && !products.length && strict) {
    return noMatchReply(siteName, searchMessage);
  }

  const parts: string[] = [];
  const queryLabel = queryLabelFromMessage(searchMessage);
  const itemLabel = queryLabel || "that";

  if (food) {
    parts.push(`🍛 Here are some food listings on ${siteName} that might work — tap a dish or the restaurant for the full menu:`);
  } else if (CORRECTION_INTENT.test(trimmed) && products.length) {
    parts.push(`${categoryEmoji(cat, food)} You're right — those earlier picks weren't on ${siteName}. Here are real listings:`);
  } else if (kind === "similar" && products.length) {
    if (intent.isFashion || cat === "fashion_accessories") {
      parts.push(
        `👖 I couldn't find any ${itemLabel} available right now, but I found a couple of similar styles:`
      );
    } else {
      parts.push(`Sorry, I couldn't find ${itemLabel} right now — here are a few similar options:`);
    }
  } else if (kind === "exact" && products.length) {
    parts.push(`${categoryEmoji(cat, food)} Here are some options on ${siteName} that match what you're looking for:`);
  } else if (products.length) {
    parts.push(`${categoryEmoji(cat, food)} Here are a few picks on ${siteName}:`);
  }

  if (products.length) {
    const storeNames = [
      ...new Set(
        products
          .map((p) => String((p as { store?: { name?: string } }).store?.name || "").trim())
          .filter(Boolean)
      )
    ];
    const sameStore = storeNames.length === 1 ? storeNames[0] : null;
    const compactNonFood =
      !food && kind === "exact" && products.length <= 6 && products.every((p) => String((p as { category?: string }).category || "") !== "services");

    if (compactNonFood) {
      parts.push(
        "",
        ...products.map((p) => {
          const name = String((p as { name?: string }).name || "Item").trim() || "Item";
          const price = Number((p as { price?: unknown }).price) || 0;
          return `• ${name} · GHS ${price}`;
        })
      );
      if (sameStore) parts.push("", `Sold by ${sameStore}.`);
    } else {
      parts.push(
        "",
        ...products.map((p) =>
          formatProductLine(p as Record<string, unknown> & { store?: { name?: string; slug?: string } }, origin)
        )
      );
    }
  }

  if (kind === "similar" && products.length && (intent.isFashion || cat === "fashion_accessories")) {
    const colorTip = fashionColorAlternativesText(searchMessage);
    if (colorTip) parts.push("", colorTip);
    parts.push("", "Want me to narrow this down by size or budget?");
  } else if (kind === "similar" && products.length) {
    parts.push("", "Want me to refine the search — different color, brand, or price?");
  } else if (food && products.length) {
    parts.push("", "Need something else on the menu? Just say the dish or restaurant you're after.");
  } else if (products.length && kind === "exact") {
    parts.push("", "Want more options like these, or something more specific?");
  }

  if (food && stores.length && products.length) {
    parts.push(
      "",
      "More restaurants:",
      ...stores.map((b) => formatStoreLine(String(b.name || "Store"), String(b.slug || "").trim() || undefined, origin))
    );
  }

  return normalizeAssistantReply(parts.join("\n"));
}

export async function buildAssistantIdleReply(
  siteName: string,
  message: string,
  req: Request,
  history?: ChatTurn[]
): Promise<string> {
  return buildAssistantCatalogReply(siteName, message, req, history);
}
