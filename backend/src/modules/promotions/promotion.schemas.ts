import { z } from "zod";
import { PROMOTION_KINDS } from "./promotion.model";

const kindEnum = z.enum(PROMOTION_KINDS);

export const vendorCreatePromotionSchema = z
  .object({
    kind: kindEnum,
    businessId: z.string().optional().nullable(),
    productId: z.string().optional().nullable(),
    title: z.string().trim().min(4).max(200),
    subtitle: z.string().trim().max(500).optional().default(""),
    code: z.string().trim().max(40).optional().default(""),
    discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
    discountAmountGhs: z.coerce.number().min(0).optional().nullable(),
    minOrderGhs: z.coerce.number().min(0).optional().nullable(),
    freeDelivery: z.boolean().optional().default(false),
    compareAtGhs: z.coerce.number().min(0).optional().nullable(),
    salePriceGhs: z.coerce.number().min(0).optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    soldPercent: z.coerce.number().min(0).max(100).optional().nullable(),
    tagBadge: z.string().trim().max(24).optional().default(""),
    gradientKey: z.string().trim().max(32).optional().default("violet"),
    imageUrl: z.string().trim().max(500).optional().nullable(),
    categoryKey: z.string().trim().max(64).optional().nullable(),
    linkPath: z.string().trim().max(500).optional().nullable(),
    priority: z.coerce.number().int().optional().default(0)
  })
  .superRefine((data, ctx) => {
    if (data.kind === "coupon" && !String(data.code || "").trim()) {
      ctx.addIssue({ code: "custom", message: "Coupon requires a code", path: ["code"] });
    }
    const productKinds = ["flash_sale", "deal_discount", "deal_bundle"] as const;
    if (productKinds.includes(data.kind as (typeof productKinds)[number]) && !String(data.productId || "").trim()) {
      ctx.addIssue({
        code: "custom",
        message: "This deal type requires a product",
        path: ["productId"]
      });
    }
    if (data.kind !== "deal_discount" && !data.endsAt) {
      ctx.addIssue({ code: "custom", message: "End date/time is required", path: ["endsAt"] });
    }
    if (data.endsAt && data.startsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({ code: "custom", message: "End time must be after start", path: ["endsAt"] });
    }
  });

export const adminRejectPromotionSchema = z.object({
  reason: z.string().trim().max(2000).optional().default("")
});

export const adminCreatePromotionSchema = vendorCreatePromotionSchema.extend({
  sellerId: z.string().optional().nullable(),
  reviewStatus: z.enum(["approved", "draft", "pending"]).optional().default("approved")
});

export const adminPromotionsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "draft", "all"]).optional().default("pending"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});
