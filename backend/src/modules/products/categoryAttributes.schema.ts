import { z } from "zod";
import type { ProductCategory } from "./product.model";

function coerceEmptyStrings<T extends Record<string, unknown>>(o: T): T {
  const next = { ...o };
  for (const k of Object.keys(next)) {
    if (next[k] === "") delete next[k];
  }
  return next;
}

const foodDrinksCategoryAttributesSchema = z
  .object({
    preparationTimeMinutes: z.coerce.number().int().min(0).max(10080).optional(),
    availability: z.string().max(500).optional(),
    deliveryOption: z.enum(["pickup", "campus_delivery", "both"]).optional(),
    ingredients: z.string().max(4000).optional(),
    portionSize: z.string().max(200).optional()
  })
  .strict();

const fashionCategoryAttributesSchema = z
  .object({
    sizes: z.string().max(800).optional(),
    colors: z.string().max(500).optional(),
    gender: z.string().max(80).optional(),
    condition: z.string().max(80).optional(),
    brand: z.string().max(200).optional(),
    material: z.string().max(400).optional()
  })
  .strict();

const electronicsCategoryAttributesSchema = z
  .object({
    brand: z.string().max(200).optional(),
    model: z.string().max(200).optional(),
    condition: z.string().max(80).optional(),
    warranty: z.string().max(600).optional(),
    specifications: z.string().max(8000).optional()
  })
  .strict();

const beautyCategoryAttributesSchema = z
  .object({
    skinHairType: z.string().max(300).optional(),
    expiryDate: z.string().max(80).optional()
  })
  .strict();

const booksCategoryAttributesSchema = z
  .object({
    author: z.string().max(300).optional(),
    courseCode: z.string().max(120).optional(),
    condition: z.string().max(80).optional(),
    pdfUrl: z.string().max(900).optional()
  })
  .strict();

const groceriesCategoryAttributesSchema = z
  .object({
    packQuantity: z.string().max(120).optional(),
    unit: z.string().max(40).optional(),
    expiryDate: z.string().max(80).optional()
  })
  .strict();

const servicesCategoryAttributesSchema = z
  .object({
    whatsIncluded: z.string().max(4000).optional(),
    estimatedTurnaround: z.string().max(400).optional(),
    serviceArea: z.string().max(600).optional(),
    clientShouldProvide: z.string().max(2000).optional(),
    serviceExamples: z.string().max(600).optional()
  })
  .strict();

const byCategory: Record<ProductCategory, z.ZodType<Record<string, unknown>>> = {
  food_drinks: foodDrinksCategoryAttributesSchema,
  fashion_accessories: fashionCategoryAttributesSchema,
  electronics_gadgets: electronicsCategoryAttributesSchema,
  beauty_personal_care: beautyCategoryAttributesSchema,
  books_academic: booksCategoryAttributesSchema,
  groceries_essentials: groceriesCategoryAttributesSchema,
  services: servicesCategoryAttributesSchema
};

export function safeParseCategoryAttributes(category: ProductCategory, raw: unknown) {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const cleaned = coerceEmptyStrings(base);
  return byCategory[category].safeParse(cleaned);
}

export function normalizeCategoryAttributes(
  category: ProductCategory,
  raw: unknown
): Record<string, unknown> {
  const r = safeParseCategoryAttributes(category, raw);
  if (!r.success) return {};
  return coerceEmptyStrings(r.data as Record<string, unknown>);
}
