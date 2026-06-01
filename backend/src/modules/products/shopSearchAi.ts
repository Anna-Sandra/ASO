import type { ProductCategory } from "./product.model";
import { PRODUCT_CATEGORIES } from "./product.model";
import { groqCompletion, groqConfigured } from "../assistant/groqChat";
import { detectCategoryFromMessage, expandShopSearchQuery } from "./shopSearchExpand";
import { normalizeGhanaShopperQuery } from "./ghanaShopLanguage";

function stripJsonMarkdownFences(s: string): string {
  let t = s.trim();
  if (!t.startsWith("`")) return t;
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return t;
}

export type ShopSearchAiExpansion = {
  keywords: string[];
  categoryHint: ProductCategory | null;
  usedGroq: boolean;
  normalizedQuery: string;
};

/** Rule + optional Groq expansion for shop search (Ghana marketplace). */
export async function expandShopSearchWithAi(rawQ: string): Promise<ShopSearchAiExpansion> {
  const normalizedQuery = normalizeGhanaShopperQuery(rawQ);
  const expansion = expandShopSearchQuery(normalizedQuery);
  const fallbackKw = expansion.keywords.length ? expansion.keywords : expandShopSearchQuery(rawQ).keywords;
  const heuristicCat = expansion.categoryHint ?? detectCategoryFromMessage(normalizedQuery);

  const shouldTryGroq =
    groqConfigured() &&
    normalizedQuery.length >= 3 &&
    (normalizedQuery.split(/\s+/).length >= 2 || !heuristicCat);

  if (!shouldTryGroq) {
    return { keywords: fallbackKw, categoryHint: heuristicCat, usedGroq: false, normalizedQuery };
  }

  const allowedCats = PRODUCT_CATEGORIES.join(", ");
  const system = `You help shoppers search SHOPIQGH, a Ghana e-commerce marketplace.
Understand English, Ghana Pidgin, and common Twi food/shopping phrases.

Respond with ONLY valid JSON — no markdown. Keys:
- "keywords": 1–8 short search words/phrases for product catalogue (synonyms OK; drop filler).
- "category_hint": one of [${allowedCats}] or null.

Examples:
- "something warm for harmattan" → keywords: jacket, hoodie, sweater, warm; category_hint: fashion_accessories
- "chale I wan chop" → keywords: food, jollof, waakye, restaurant; category_hint: food_drinks`;

  try {
    const text = await groqCompletion(system, [{ role: "user", content: normalizedQuery.slice(0, 250) }]);
    if (!text) {
      return { keywords: fallbackKw, categoryHint: heuristicCat, usedGroq: false, normalizedQuery };
    }
    const parsed = JSON.parse(stripJsonMarkdownFences(text)) as {
      keywords?: unknown;
      category_hint?: unknown;
    };
    const rawKw = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const keywords = [
      ...new Set(
        rawKw
          .map((x) => String(x ?? "").trim().toLowerCase().replace(/\s+/g, " "))
          .filter((s) => s.length >= 2 && s.length <= 64)
      )
    ].slice(0, 8);
    let categoryHint: ProductCategory | null = null;
    if (typeof parsed.category_hint === "string") {
      const c = parsed.category_hint.trim();
      if ((PRODUCT_CATEGORIES as readonly string[]).includes(c)) categoryHint = c as ProductCategory;
    }
    const merged = [...new Set([...keywords, ...fallbackKw])].slice(0, 20);
    return {
      keywords: merged.length ? merged : fallbackKw,
      categoryHint: categoryHint ?? heuristicCat,
      usedGroq: true,
      normalizedQuery
    };
  } catch {
    return { keywords: fallbackKw, categoryHint: heuristicCat, usedGroq: false, normalizedQuery };
  }
}
