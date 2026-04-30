import { z } from "zod";

function firstQueryString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}

const reportCategoryEnum = z.enum([
  "item_not_delivered",
  "wrong_item_received",
  "fake_misleading_product",
  "seller_not_responding",
  "buyer_no_show",
  "payment_not_confirmed",
  "fraudulent_activity",
  "abuse_misconduct",
  "fake_seller",
  "scam",
  "bad_product",
  "chat_abuse",
  "other"
]);

export const createReportSchema = z.object({
  category: reportCategoryEnum,
  description: z.string().trim().min(10).max(4000),
  targetType: z.enum(["product", "user", "order", "other"]).default("other"),
  targetId: z.string().trim().max(64).optional(),
  evidenceUrls: z
    .array(z.string().trim().min(1).max(500))
    .max(3)
    .optional()
    .default([])
});

export const myReportsQuerySchema = z.object({
  page: z.preprocess((v) => Number(firstQueryString(v)) || 1, z.number().int().positive()),
  limit: z.preprocess((v) => Math.min(Number(firstQueryString(v)) || 15, 50), z.number().int().positive().max(50))
});
