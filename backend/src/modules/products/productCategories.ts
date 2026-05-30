import { PRODUCT_CATEGORIES, type ProductCategory } from "./product.model";

/** Legacy / typo slugs stored before enums were strict — map to canonical `PRODUCT_CATEGORIES` values. */
const LEGACY_CATEGORY_SLUG_MAP: Record<string, ProductCategory> = {
  coffee: "food_drinks",
  beans: "food_drinks",
  snacks: "food_drinks",
  gear: "electronics_gadgets",
  mugs: "groceries_essentials",
  materials: "fashion_accessories",
  equipment: "electronics_gadgets",
  food: "food_drinks",
  electronics: "electronics_gadgets",
  books: "books_academic",
  clothing: "fashion_accessories",
  footwears: "fashion_accessories",
  other: "groceries_essentials",
  baby: "babies_infants",
  babies: "babies_infants",
  infant: "babies_infants",
  infants: "babies_infants",
  baby_infants: "babies_infants",
  babies_infant: "babies_infants",
  baby_infant: "babies_infants",
  babies_and_infants: "babies_infants",
  baby_and_infants: "babies_infants",
  babies_and_infant: "babies_infants",
  baby_and_infant: "babies_infants",
  beauty: "beauty_personal_care",
  beauty_personal: "beauty_personal_care",
  personal_care: "beauty_personal_care",
  fashion: "fashion_accessories",
  groceries: "groceries_essentials",
  grocery: "groceries_essentials",
  academic: "books_academic"
};

const allowed = new Set<string>(PRODUCT_CATEGORIES);

/**
 * Normalize a raw category string from DB, query params, or imports to a canonical slug (or null).
 */
export function normalizeProductCategory(raw: unknown): ProductCategory | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return null;
  if (allowed.has(s)) return s as ProductCategory;
  return LEGACY_CATEGORY_SLUG_MAP[s] ?? null;
}

/** All Mongo `category` values that should match a canonical marketplace category (aliases + canonical). */
export function expandCategoryForMongoFilter(canonical: ProductCategory): string[] {
  const out = new Set<string>([canonical]);
  for (const [alias, target] of Object.entries(LEGACY_CATEGORY_SLUG_MAP)) {
    if (target === canonical) out.add(alias);
  }
  return [...out];
}

/** Mongo filter fragment: `{ category: { $in: [...] } }` for canonical category queries. */
export function mongoCategoryEquals(canonical: ProductCategory): { category: { $in: string[] } } {
  return { category: { $in: expandCategoryForMongoFilter(canonical) } };
}

/** Word-boundary match for baby/infant listings miscategorized under Groceries/Fashion. */
export const BABY_LISTING_TEXT_RE =
  /\b(baby|babies|infant|infants|newborn|nursery|stroller|pram|crib|diaper|napp(?:y|ies)|swaddle|teether|bodysuit|onesie)\b/i;

const BABY_MISCAT_PARENT_CATEGORIES: ProductCategory[] = [
  "groceries_essentials",
  "fashion_accessories",
  "beauty_personal_care"
];

export function listingTextLooksLikeBabies(name: unknown, description?: unknown): boolean {
  const blob = `${String(name || "")} ${String(description || "")}`;
  return BABY_LISTING_TEXT_RE.test(blob);
}

/**
 * Buyer category browse filter — includes canonical slugs plus obvious miscategorized baby listings.
 */
export function mongoCategoryBrowseFilter(canonical: ProductCategory): Record<string, unknown> {
  const slugIn = expandCategoryForMongoFilter(canonical);
  if (canonical !== "babies_infants") {
    return { category: { $in: slugIn } };
  }
  const textOr = [
    { name: BABY_LISTING_TEXT_RE },
    { description: BABY_LISTING_TEXT_RE },
    { listingSearchAssist: BABY_LISTING_TEXT_RE }
  ];
  return {
    $or: [
      { category: { $in: slugIn } },
      {
        category: { $in: BABY_MISCAT_PARENT_CATEGORIES },
        $or: textOr
      }
    ]
  };
}

export function legacyCategorySlugMapForMigration(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [from, to] of Object.entries(LEGACY_CATEGORY_SLUG_MAP)) {
    if (from !== to) map[from] = to;
  }
  return map;
}
