import { Product } from "../products/product.model";
import type { ProductCategory } from "../products/product.model";
import { mongoCategoryBrowseFilter } from "../products/productCategories";
import {
  activeStoreBusinessIds,
  enrichPublicProducts,
  foodMenuStoreFilter
} from "../products/product.publicSerialize";
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import {
  detectCategoryFromMessage,
  expandShopSearchQuery,
  shouldSupplementCategoryBrowse
} from "../products/shopSearchExpand";
import { normalizeGhanaShopperQuery } from "../products/ghanaShopLanguage";

export { detectCategoryFromMessage };

export type AssistantSearchIntent = {
  keywords: string[];
  category: ProductCategory | null;
  subcategory: string | null;
  colors: string[];
  brands: string[];
  sizes: string[];
  priceMax: number | null;
  priceMin: number | null;
  isFood: boolean;
  isFashion: boolean;
};

/** Structured intent from a shopper message (regex + heuristics). */
export function extractSearchIntent(message: string): AssistantSearchIntent {
  const normalized = normalizeGhanaShopperQuery(message);
  const m = normalized.toLowerCase();

  const isFood = /food|eat|hungry|fufu|jollof|kenkey|banku|waakye|rice|soup|drink|snack|breakfast|lunch|dinner|restaurant|menu/.test(m);
  const isFashion =
    /shoe|heel|boot|sneaker|canvas|sandal|dress|shirt|trouser|jean|bag|purse|cloth|wear|fashion|outfit|jewel|jewelry|jewellery|watch|accessor|accessories|bracelet|necklace|earring|bangle|ankara|kente/.test(
      m
    );
  const isElectronics =
    /phone|laptop|tablet|earphone|headphone|charger|cable|gadget|computer|computing|screen|\bit\b|tech|technology|ict|iphone|android|powerbank|usb/.test(
      m
    );
  const isBeauty =
    /cream|lotion|makeup|hair|braid|braids|weave|wig|extension|skin|skincare|nail|beauty|perfume|cologne|toothbrush|toothpaste|deodorant|soap|shampoo|conditioner|razor|shaving|floss|mouthwash|sanitary|tampon|\bpad\b|\bmask\b|barber/.test(
      m
    );
  const isGrocery = /rice|oil|tomato|pepper|onion|grocery|provision/.test(m);

  const shopExpansion = expandShopSearchQuery(normalized);
  let category: ProductCategory | null = detectCategoryFromMessage(normalized) ?? shopExpansion.categoryHint;
  if (!category) {
    if (isFood) category = "food_drinks";
    else if (isFashion) category = "fashion_accessories";
    else if (isElectronics) category = "electronics_gadgets";
    else if (isBeauty) category = "beauty_personal_care";
    else if (isGrocery) category = "groceries_essentials";
  }

  const colorWords = [
    "red",
    "blue",
    "green",
    "black",
    "white",
    "yellow",
    "pink",
    "purple",
    "orange",
    "brown",
    "grey",
    "gray",
    "gold",
    "silver",
    "navy",
    "cream",
    "beige",
    "burgundy"
  ];
  const colors = colorWords.filter((c) => m.includes(c));

  const brandWords = [
    "adidas",
    "nike",
    "puma",
    "reebok",
    "vans",
    "converse",
    "samsung",
    "apple",
    "tecno",
    "infinix",
    "itel",
    "huawei",
    "oppo",
    "xiaomi",
    "nivea",
    "ors",
    "cantu",
    "zara",
    "gucci",
    "aldo"
  ];
  const brands = brandWords.filter((b) => m.includes(b));

  const sizeMatch = m.match(/size\s+(\d+|xs|s\b|m\b|l\b|xl|xxl)/gi) || [];
  const sizes = sizeMatch.map((s) => s.replace(/size\s+/i, "").trim());

  const priceMaxMatch = m.match(/under\s+(?:ghs\s+)?(\d+)|(?:ghs\s+)?(\d+)\s+or\s+less|below\s+(?:ghs\s+)?(\d+)/);
  const priceMax = priceMaxMatch
    ? Number(priceMaxMatch[1] || priceMaxMatch[2] || priceMaxMatch[3])
    : null;

  const priceMinMatch = m.match(/above\s+(?:ghs\s+)?(\d+)|over\s+(?:ghs\s+)?(\d+)|more\s+than\s+(?:ghs\s+)?(\d+)/);
  const priceMin = priceMinMatch
    ? Number(priceMinMatch[1] || priceMinMatch[2] || priceMinMatch[3])
    : null;

  const stopWords = new Set([
    "i",
    "want",
    "need",
    "show",
    "me",
    "find",
    "looking",
    "for",
    "a",
    "the",
    "some",
    "please",
    "can",
    "you",
    "give",
    "get",
    "buy",
    "purchase",
    "have",
    "do",
    "is",
    "are",
    "where",
    "what",
    "how",
    "my",
    "any",
    "all",
    "this",
    "that",
    "got",
    "sell",
    "carry",
    "stock"
  ]);
  const keywordSet = new Set(
    m
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
  );
  for (const k of shopExpansion.queryTokens) keywordSet.add(k);
  for (const k of shopExpansion.keywords.slice(0, 14)) keywordSet.add(k);

  return {
    keywords: [...keywordSet].slice(0, 16),
    category,
    subcategory: null,
    colors,
    brands,
    sizes,
    priceMax: Number.isFinite(priceMax) ? priceMax : null,
    priceMin: Number.isFinite(priceMin) ? priceMin : null,
    isFood,
    isFashion
  };
}

/** True when the shopper is asking about a specific product type (not just browsing). */
export function messageHasShoppingIntent(message: string): boolean {
  const t = String(message || "").trim();
  if (!t) return false;
  if (/\b(i|we)\s+(need|want|get|buy|looking\s+for)\b/i.test(t)) return true;
  if (/\b(do you have|have you got|got any|in stock|looking for|show\s+me|any\s+.+\s+(available|in stock))\b/i.test(t)) {
    return true;
  }
  const intent = extractSearchIntent(t);
  if (intent.keywords.length >= 2) return true;
  if (intent.colors.length && intent.keywords.length > 0) return true;
  if (intent.keywords.length >= 1 && (intent.category || intent.isFood || intent.isFashion)) return true;
  return false;
}

/** Short label for “what they asked for” in no-match copy. */
export function queryLabelFromMessage(message: string): string {
  const intent = extractSearchIntent(message);
  const colorSet = new Set(intent.colors.map((c) => c.toLowerCase()));
  const parts = [
    ...intent.colors,
    ...intent.keywords.filter((k) => !colorSet.has(k.toLowerCase())),
    ...intent.brands
  ];
  let label = [...new Set(parts.map((p) => p.trim()).filter(Boolean))].join(" ").trim();
  label = humanizeQueryLabel(label);
  return label || humanizeQueryLabel(String(message || "").trim().slice(0, 72));
}

/** "friedrice" → "fried rice", etc., for natural assistant copy. */
function humanizeQueryLabel(label: string): string {
  let s = String(label || "").trim();
  const fixes: [RegExp, string][] = [
    [/\bfriedrice\b/gi, "fried rice"],
    [/\bgreenjeans\b/gi, "green jeans"],
    [/\bbluejeans\b/gi, "blue jeans"],
    [/\bblackjeans\b/gi, "black jeans"],
    [/\bt\s*shirt\b/gi, "t-shirt"]
  ];
  for (const [re, rep] of fixes) s = s.replace(re, rep);
  return s.replace(/\s+/g, " ").trim();
}

function productSearchBlob(p: Record<string, unknown>): string {
  const parts: string[] = [
    String(p.name || ""),
    String(p.description || ""),
    String(p.listingSearchAssist || "")
  ];
  const tags = p.tags;
  if (Array.isArray(tags)) parts.push(...tags.map(String));
  const aiTags = p.aiTags;
  if (Array.isArray(aiTags)) parts.push(...aiTags.map(String));
  const attrs = p.categoryAttributes;
  if (attrs && typeof attrs === "object") {
    for (const v of Object.values(attrs as Record<string, unknown>)) {
      if (Array.isArray(v)) parts.push(...v.map(String));
      else if (v != null) parts.push(String(v));
    }
  }
  return parts.join(" ").toLowerCase();
}

function termVariants(term: string): string[] {
  const t = term.toLowerCase().trim();
  if (!t) return [];
  const out = [t];
  if (t.length > 3 && t.endsWith("s")) out.push(t.slice(0, -1));
  if (t.length > 3 && !t.endsWith("s")) out.push(`${t}s`);
  return [...new Set(out)];
}

function termMatchesHay(hay: string, term: string): boolean {
  for (const v of termVariants(term)) {
    if (v.length <= 4) {
      const re = new RegExp(`\\b${escapeRegex(v)}\\b`, "i");
      if (re.test(hay)) return true;
    } else if (hay.includes(v)) {
      return true;
    }
  }
  return false;
}

function scoreProductMatch(p: Record<string, unknown>, terms: string[]): number {
  if (!terms.length) return 0;
  const hay = productSearchBlob(p);
  let score = 0;
  for (const term of terms) {
    if (termMatchesHay(hay, term)) {
      score += term.length >= 4 ? 2 : 1;
    }
  }
  return score;
}

/** Drop food/beauty/etc. when the shopper asked for fashion (and vice versa). */
function matchesIntentCategory(p: Record<string, unknown>, intent: AssistantSearchIntent): boolean {
  const cat = String((p as { category?: string }).category || "");
  if (intent.isFood) return cat === "food_drinks" || cat === "services";
  if (intent.isFashion) return cat === "fashion_accessories";
  if (intent.category) return cat === intent.category;
  return true;
}

function filterRelevantRows(rows: Record<string, unknown>[], intent: AssistantSearchIntent): Record<string, unknown>[] {
  return rows.filter((p) => isExactProductMatch(p, intent) && matchesIntentCategory(p, intent));
}

function partitionSearchTerms(intent: AssistantSearchIntent) {
  const colorSet = new Set(intent.colors.map((c) => c.toLowerCase()));
  const allTerms = [...intent.keywords, ...intent.colors, ...intent.brands, ...intent.sizes].filter(Boolean);
  const primary = [
    ...intent.keywords.filter((k) => !colorSet.has(k.toLowerCase())),
    ...intent.brands,
    ...intent.sizes
  ].filter(Boolean);
  const uniq = (arr: string[]) => [...new Set(arr.map((s) => s.toLowerCase().trim()).filter(Boolean))];
  return { allTerms: uniq(allTerms), primary: uniq(primary), colorSet };
}

function enrichSearchTermsForIntent(intent: AssistantSearchIntent, terms: string[]): string[] {
  const joined = terms.join(" ").toLowerCase();
  const out = new Set(terms.map((s) => s.toLowerCase().trim()).filter(Boolean));
  const expanded = expandShopSearchQuery(joined || terms.join(" "));
  for (const k of expanded.keywords) out.add(k);

  if (/\bshoe|shoes|shoea|footwear|sneaker|trainer|canvas\b/.test(joined)) {
    for (const t of ["shoe", "shoes", "sneaker", "sneakers", "canvas", "trainer", "trainers", "footwear", "sandal"]) {
      out.add(t);
    }
  }
  if (/\bjewel|jewelry|jewellery\b/.test(joined)) {
    for (const t of ["jewelry", "jewellery", "necklace", "earring", "earrings", "bracelet", "ring", "chain", "pendant"]) {
      out.add(t);
    }
  }
  if (/\bmask\b/.test(joined)) {
    out.add("mask");
    out.add("masks");
  }
  if (intent.isFood || /\b(food|foods|dish|dishes|meal|meals|menu|menus|eat|eating|lunch|dinner|breakfast|brunch|snack|restaurant)\b/.test(joined)) {
    for (const t of [
      "food",
      "foods",
      "dish",
      "dishes",
      "meal",
      "meals",
      "menu",
      "menus",
      "restaurant",
      "restaurants",
      "eat",
      "lunch",
      "dinner",
      "breakfast",
      "snack"
    ]) {
      out.add(t);
    }
  }

  return [...out];
}

function isExactProductMatch(p: Record<string, unknown>, intent: AssistantSearchIntent): boolean {
  const { allTerms, primary } = partitionSearchTerms(intent);
  if (!allTerms.length) return true;

  const shopExpansion = expandShopSearchQuery(
    [...intent.keywords, ...intent.colors, ...intent.brands].join(" ").trim() || primary.join(" ")
  );
  if (shopExpansion.isBroadCategory && matchesIntentCategory(p, intent)) {
    return true;
  }
  if (shopExpansion.keywords.length > 0 && scoreProductMatch(p, shopExpansion.keywords) > 0) {
    if (shopExpansion.categoryHint) {
      return matchesIntentCategory(p, { ...intent, category: shopExpansion.categoryHint });
    }
    return true;
  }

  const maskQuery = primary.some((t) => t === "mask" || t === "masks") || allTerms.some((t) => t === "mask" || t === "masks");
  if (maskQuery && scoreProductMatch(p, ["mask", "masks"]) === 0) return false;

  if (primary.length >= 2) {
    for (const term of primary) {
      if (scoreProductMatch(p, [term]) === 0) return false;
    }
    return true;
  }

  if (primary.length > 0 && scoreProductMatch(p, primary) === 0) return false;
  if (intent.colors.length > 0 && scoreProductMatch(p, intent.colors) === 0) return false;
  return scoreProductMatch(p, allTerms) > 0;
}

function rankByRelevance(rows: Record<string, unknown>[], intent: AssistantSearchIntent): Record<string, unknown>[] {
  const { allTerms } = partitionSearchTerms(intent);
  return [...rows].sort((a, b) => scoreProductMatch(b, allTerms) - scoreProductMatch(a, allTerms));
}

const buyerCatalogBase = (activeIds: Awaited<ReturnType<typeof activeStoreBusinessIds>>) => ({
  status: "active",
  $or: [{ category: "services" }, { stock: { $gt: 0 } }, { category: "food_drinks" }],
  ...foodMenuStoreFilter(activeIds)
});

async function queryCatalogRows(
  intent: AssistantSearchIntent,
  searchTerms: string[],
  limit: number
): Promise<Record<string, unknown>[]> {
  const activeIds = await activeStoreBusinessIds();
  const base: Record<string, unknown> = {
    ...buyerCatalogBase(activeIds)
  };

  if (intent.category) {
    Object.assign(base, mongoCategoryBrowseFilter(intent.category));
  }

  if (intent.priceMax != null) {
    base.price = { ...(typeof base.price === "object" ? (base.price as object) : {}), $lte: intent.priceMax };
  }
  if (intent.priceMin != null) {
    const prev = typeof base.price === "object" && base.price != null ? (base.price as Record<string, number>) : {};
    base.price = { ...prev, $gte: intent.priceMin };
  }

  let rows: Record<string, unknown>[] = [];

  if (searchTerms.length > 0) {
    const searchStr = searchTerms.join(" ");
    try {
      rows = (await Product.find({
        ...base,
        $text: { $search: searchStr }
      })
        .sort({ score: { $meta: "textScore" } })
        .limit(limit * 3)
        .lean()) as unknown as Record<string, unknown>[];
    } catch {
      rows = [];
    }
  }

  if (rows.length < limit && searchTerms.length > 0) {
    const re = new RegExp(searchTerms.map(escapeRegex).join("|"), "i");
    const regexRows = (await Product.find({
      ...base,
      $or: [
        { name: re },
        { description: re },
        { tags: re },
        { aiTags: re },
        { "categoryAttributes.brand": re },
        { "categoryAttributes.colors": re },
        { "categoryAttributes.color": re },
        { "categoryAttributes.sizes": re },
        { "categoryAttributes.material": re },
        { "categoryAttributes.style": re },
        { listingSearchAssist: re },
        { subcategory: re }
      ]
    })
      .sort({ updatedAt: -1 })
      .limit(limit * 3)
      .lean()) as unknown as Record<string, unknown>[];

    const seen = new Set(rows.map((r) => String(r._id)));
    for (const r of regexRows) {
      const id = String(r._id);
      if (!seen.has(id)) {
        rows.push(r);
        seen.add(id);
      }
    }
  }

  const shopExpansion = expandShopSearchQuery(intent.keywords.join(" ") || searchTerms.slice(0, 6).join(" "));
  const browseCat = intent.category ?? shopExpansion.categoryHint;
  if (rows.length < limit && browseCat && shouldSupplementCategoryBrowse(shopExpansion, rows.length)) {
    const browseRows = (await Product.find(base)
      .sort({ updatedAt: -1 })
      .limit(limit * 3)
      .lean()) as unknown as Record<string, unknown>[];
    const seen = new Set(rows.map((r) => String(r._id)));
    for (const r of browseRows) {
      const id = String(r._id);
      if (!seen.has(id)) {
        rows.push(r);
        seen.add(id);
      }
    }
  }

  return rows;
}

/**
 * Message-driven catalog search — only returns listings that match the shopper’s terms.
 * Never fills with unrelated “latest” products when the query is specific.
 */
export async function searchProductsForAssistant(
  message: string,
  limit = 10
): Promise<Record<string, unknown>[]> {
  const intent = extractSearchIntent(message);
  const { allTerms } = partitionSearchTerms(intent);
  const searchTerms = enrichSearchTermsForIntent(intent, allTerms);

  if (!searchTerms.length) {
    return [];
  }

  let rows = await queryCatalogRows(intent, searchTerms, limit);
  rows = filterRelevantRows(rows, intent);
  rows = rankByRelevance(rows, intent).slice(0, limit);

  if (!rows.length) {
    return [];
  }

  return enrichPublicProducts(rows as unknown as Record<string, unknown>[]);
}

/**
 * Relaxed search (e.g. “jeans” without “green”) when there is no exact catalog match.
 */
export async function searchSimilarProductsForAssistant(
  message: string,
  limit = 6
): Promise<Record<string, unknown>[]> {
  const intent = extractSearchIntent(message);
  const { primary } = partitionSearchTerms(intent);
  const relaxedTerms = enrichSearchTermsForIntent(intent, primary.length > 0 ? primary : intent.keywords.slice(0, 3));

  if (!relaxedTerms.length) {
    return [];
  }

  let rows = await queryCatalogRows(intent, relaxedTerms, limit);
  rows = rows.filter((p) => scoreProductMatch(p, relaxedTerms) > 0 && matchesIntentCategory(p, intent));
  rows = rankByRelevance(rows, intent).slice(0, limit);

  if (!rows.length) {
    return [];
  }

  return enrichPublicProducts(rows as unknown as Record<string, unknown>[]);
}
