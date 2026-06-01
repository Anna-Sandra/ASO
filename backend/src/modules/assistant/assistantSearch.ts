import { Product } from "../products/product.model";
import type { ProductCategory } from "../products/product.model";
import { mongoCategoryBrowseFilter } from "../products/productCategories";
import {
  activeStoreBusinessIds,
  enrichPublicProducts,
  foodMenuStoreFilter
} from "../products/product.publicSerialize";
import { detectCategoryFromMessage } from "./assistantFallback";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  const m = message.toLowerCase();

  const isFood = /food|eat|hungry|fufu|jollof|kenkey|banku|waakye|rice|soup|drink|snack|breakfast|lunch|dinner|restaurant|menu/.test(m);
  const isFashion =
    /shoe|heel|boot|sneaker|canvas|sandal|dress|shirt|trouser|jean|bag|purse|cloth|wear|fashion|outfit|jewel|watch|accessory/.test(m);
  const isElectronics = /phone|laptop|tablet|earphone|headphone|charger|cable|gadget|computer|screen/.test(m);
  const isBeauty = /cream|lotion|makeup|hair|skin|nail|beauty|perfume|cologne/.test(m);
  const isGrocery = /rice|oil|tomato|pepper|onion|grocery|provision/.test(m);

  let category: ProductCategory | null = detectCategoryFromMessage(message);
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
    "that"
  ]);
  const keywords = m
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);

  return {
    keywords,
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

const buyerCatalogBase = (activeIds: Awaited<ReturnType<typeof activeStoreBusinessIds>>) => ({
  status: "active",
  $or: [{ category: "services" }, { stock: { $gt: 0 } }, { category: "food_drinks" }],
  ...foodMenuStoreFilter(activeIds)
});

/**
 * Message-driven catalog search for the shopping assistant (replaces random product sample).
 */
export async function searchProductsForAssistant(
  message: string,
  limit = 10
): Promise<Record<string, unknown>[]> {
  const intent = extractSearchIntent(message);
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

  const searchTerms = [...intent.keywords, ...intent.colors, ...intent.brands, ...intent.sizes].filter(Boolean);

  if (searchTerms.length > 0) {
    const searchStr = searchTerms.join(" ");
    try {
      rows = (await Product.find({
        ...base,
        $text: { $search: searchStr }
      })
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean()) as unknown as Record<string, unknown>[];
    } catch {
      rows = [];
    }
  }

  if (rows.length < 3 && searchTerms.length > 0) {
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
        { listingSearchAssist: re }
      ]
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
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

  if (rows.length === 0 && intent.category) {
    rows = (await Product.find(base)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()) as unknown as Record<string, unknown>[];
  }

  if (rows.length === 0) {
    rows = (await Product.find({
      status: "active",
      ...foodMenuStoreFilter(activeIds)
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()) as unknown as Record<string, unknown>[];
  }

  const enriched = await enrichPublicProducts(rows.slice(0, limit) as unknown as Record<string, unknown>[]);
  return enriched;
}
