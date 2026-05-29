import { z } from "zod";
import mongoose from "mongoose";
import { MAX_PRODUCT_GALLERY_IMAGES } from "../../config/productLimits";
import { LISTING_KINDS, PRODUCT_CATEGORIES } from "./product.model";
import { normalizeCategoryAttributes, safeParseCategoryAttributes } from "./categoryAttributes.schema";
import { isValidMarketplaceSubcategory } from "./productSubcategories";

const categoryEnum = z.enum(PRODUCT_CATEGORIES);

const listingKindEnum = z.enum(LISTING_KINDS);

const optionalObjectId = (message: string) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.union([z.string().refine((s) => mongoose.isValidObjectId(s), message), z.null()]).optional()
  );

const productAddonSchema = z.object({
  label: z.string().min(1).max(80),
  priceDelta: z.coerce.number().min(0).optional().default(0)
});

const productCore = {
  name: z.string().min(1).max(200),
  description: z.string().max(10000).optional().default(""),
  category: categoryEnum,
  subcategory: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.union([z.string().trim().max(64), z.null()]).optional()),
  categoryAttributes: z.unknown().optional(),
  businessId: optionalObjectId("Invalid business id"),
  menuSectionId: optionalObjectId("Invalid menu section id"),
  listingKind: listingKindEnum.optional(),
  prepTimeMinutes: z.coerce.number().int().min(1).max(10080).optional().nullable(),
  addons: z.array(productAddonSchema).max(24).optional().default([]),
  /** Services and food (call-to-order) use 0 (“contact vendor” / no list price in the UI). */
  price: z.coerce.number().min(0),
  compareAtPrice: z.coerce.number().positive().optional().nullable(),
  stock: z.coerce.number().int().min(0).default(25),
  status: z.enum(["draft", "active"]).default("draft"),
  tags: z.array(z.string().max(32)).max(10).optional().default([]),
  imageUrls: z.array(z.string().url().or(z.string().max(500))).max(MAX_PRODUCT_GALLERY_IMAGES).optional().default([])
};

const createBody = z.object(productCore);

export const createProductSchema = createBody
  .superRefine((data, ctx) => {
    if (data.category !== "services" && data.category !== "food_drinks") {
      if (!Number.isFinite(data.price) || data.price <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Price must be greater than zero.", path: ["price"] });
      }
    } else if (data.price < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid price.", path: ["price"] });
    }
    const parsed = safeParseCategoryAttributes(data.category, data.categoryAttributes ?? {});
    if (!parsed.success) {
      for (const iss of parsed.error.issues) {
        ctx.addIssue({
          ...iss,
          path: ["categoryAttributes", ...(iss.path || [])]
        });
      }
    }
    if (data.subcategory != null && !isValidMarketplaceSubcategory(data.category, data.subcategory)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subcategory must match your listing marketplace category.",
        path: ["subcategory"]
      });
    }
  })
  .transform((d) => ({
    ...d,
    categoryAttributes: normalizeCategoryAttributes(d.category, d.categoryAttributes)
  }));

/** PATCH: when both `category` and `categoryAttributes` are sent, normalize. Otherwise controller merges category from DB before saving attributes. */
export const updateProductSchema = createBody
  .partial()
  .superRefine((data, ctx) => {
    if (data.category === undefined || data.categoryAttributes === undefined) return;
    const parsed = safeParseCategoryAttributes(data.category, data.categoryAttributes ?? {});
    if (!parsed.success) {
      for (const iss of parsed.error.issues) {
        ctx.addIssue({
          ...iss,
          path: ["categoryAttributes", ...(iss.path || [])]
        });
      }
    }
  })
  .transform((d) => {
    const out = { ...d };
    if (d.category !== undefined && d.categoryAttributes !== undefined) {
      out.categoryAttributes = normalizeCategoryAttributes(d.category, d.categoryAttributes);
    }
    return out;
  });

export const listProductsQuerySchema = z.object({
  category: categoryEnum.optional(),
  tag: z.string().max(32).optional(),
  /** Marketplace facet under the listing `category`. */
  subcategory: z.string().max(64).optional(),
  q: z.string().max(200).optional(),
  businessId: z
    .string()
    .refine((s) => mongoose.isValidObjectId(s), { message: "Invalid business id" })
    .optional(),
  /** Inclusive min list price (seller price, GHS — same unit as `price` on products). */
  minPrice: z.coerce.number().min(0).optional(),
  /** Inclusive max list price. */
  maxPrice: z.coerce.number().min(0).optional()
}).superRefine((d, ctx) => {
  if (d.minPrice != null && d.maxPrice != null && d.minPrice > d.maxPrice) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "minPrice cannot be greater than maxPrice", path: ["minPrice"] });
  }
});

/** AI-assisted marketplace search bar — expands query synonyms and narrows category when helpful. */
export const smartSearchBodySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    category: categoryEnum.optional(),
    tag: z.string().max(32).optional(),
    subcategory: z.string().max(64).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional()
  })
  .superRefine((d, ctx) => {
    if (d.minPrice != null && d.maxPrice != null && d.minPrice > d.maxPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "minPrice cannot be greater than maxPrice", path: ["minPrice"] });
    }
  });

export const recommendedProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional().default(12),
  preferCheaper: z
    .preprocess((v) => {
      if (v === undefined || v === null) return true;
      const raw = Array.isArray(v) ? v[0] : v;
      if (typeof raw === "boolean") return raw;
      const s = String(raw).toLowerCase().trim();
      if (["0", "false", "no", "off"].includes(s)) return false;
      return true;
    }, z.boolean())
    .optional()
    .default(true)
});

export const toggleProductSaveSchema = z.object({
  productId: z.string().refine((s) => mongoose.isValidObjectId(s), { message: "Invalid product id" })
});
