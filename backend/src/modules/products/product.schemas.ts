import { z } from "zod";
import { MAX_PRODUCT_GALLERY_IMAGES } from "../../config/productLimits";
import { PRODUCT_CATEGORIES } from "./product.model";

const categoryEnum = z.enum(PRODUCT_CATEGORIES);

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(10000).optional().default(""),
  category: categoryEnum,
  price: z.coerce.number().positive(),
  compareAtPrice: z.coerce.number().positive().optional().nullable(),
  stock: z.coerce.number().int().min(0).default(25),
  status: z.enum(["draft", "active"]).default("draft"),
  tags: z.array(z.string().max(32)).max(10).optional().default([]),
  imageUrls: z.array(z.string().url().or(z.string().max(500))).max(MAX_PRODUCT_GALLERY_IMAGES).optional().default([])
});

export const updateProductSchema = createProductSchema.partial();

export const listProductsQuerySchema = z.object({
  category: categoryEnum.optional(),
  tag: z.string().max(32).optional(),
  q: z.string().max(200).optional(),
  maxPrice: z.coerce.number().positive().optional()
});
