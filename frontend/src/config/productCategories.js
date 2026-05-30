import { CATEGORY_LABELS, PRODUCT_CATEGORY_VALUES } from "./catalog";

/** Legacy slug aliases — keep in sync with backend `productCategories.ts`. */
const LEGACY_TO_CANONICAL = {
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
  fashion: "fashion_accessories",
  electronics: "electronics_gadgets",
  groceries: "groceries_essentials",
  books: "books_academic",
  food: "food_drinks"
};

export function normalizeProductCategoryId(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return null;
  if (PRODUCT_CATEGORY_VALUES.includes(s)) return s;
  return LEGACY_TO_CANONICAL[s] || null;
}

export function categoryDisplayLabel(raw) {
  const id = normalizeProductCategoryId(raw) || raw;
  return CATEGORY_LABELS[id] || (typeof raw === "string" ? raw : "");
}
