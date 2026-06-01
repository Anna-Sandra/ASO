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
    material: z.string().max(400).optional(),
    style: z.string().max(120).optional()
  })
  .strict();

const electronicsCategoryAttributesSchema = z
  .object({
    brand: z.string().max(200).optional(),
    model: z.string().max(200).optional(),
    condition: z.string().max(80).optional(),
    color: z.string().max(120).optional(),
    storage: z.string().max(120).optional(),
    warranty: z.string().max(600).optional(),
    specifications: z.string().max(8000).optional()
  })
  .strict();

const beautyCategoryAttributesSchema = z
  .object({
    brand: z.string().max(200).optional(),
    skinHairType: z.string().max(300).optional(),
    expiryDate: z.string().max(80).optional()
  })
  .strict();

const babiesInfantsCategoryAttributesSchema = z
  .object({
    ageRangeOrStage: z.string().max(200).optional(),
    compositionOrMaterials: z.string().max(600).optional(),
    safetyOrComplianceNotes: z.string().max(500).optional(),
    sizingOrDimensions: z.string().max(200).optional()
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
  babies_infants: babiesInfantsCategoryAttributesSchema,
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

function req(attrs: Record<string, unknown>, key: string): boolean {
  const v = attrs[key];
  return typeof v === "string" && v.trim().length > 0;
}

/** Publish-time required fields — drafts may omit. Returns first error message or null. */
export function validateRequiredCategoryAttributesForPublish(
  category: ProductCategory,
  raw: unknown
): string | null {
  const attrs = normalizeCategoryAttributes(category, raw);
  switch (category) {
    case "fashion_accessories":
      if (!req(attrs, "brand")) {
        return "Please enter the brand name. Write 'No brand' if unbranded.";
      }
      if (!req(attrs, "colors")) return "Please enter the color(s) of this item.";
      if (!req(attrs, "sizes")) return "Please enter sizes offered (e.g. 40, 41, 42 or S, M, L).";
      if (!req(attrs, "gender")) return "Please select gender / fit.";
      if (!req(attrs, "condition")) return "Please select condition.";
      break;
    case "electronics_gadgets":
      if (!req(attrs, "brand")) return "Please enter the brand (e.g. Samsung, Apple, Tecno).";
      if (!req(attrs, "model")) return "Please enter the model name or number.";
      if (!req(attrs, "condition")) return "Please select condition.";
      break;
    case "beauty_personal_care":
      if (!req(attrs, "brand")) return "Please enter the brand name.";
      if (!req(attrs, "skinHairType")) return "Please describe skin / hair type this product suits.";
      break;
    case "babies_infants":
      if (!req(attrs, "ageRangeOrStage")) return "Please enter age range / stage (e.g. Newborn, 0–6 months).";
      break;
    case "food_drinks":
      if (!req(attrs, "ingredients")) return "Please list main ingredients buyers should know.";
      if (!req(attrs, "portionSize")) return "Please enter portion size.";
      if (!req(attrs, "availability")) return "Please enter availability (days/hours).";
      if (!req(attrs, "deliveryOption")) return "Please choose a delivery option.";
      break;
    default:
      break;
  }
  return null;
}
