import { z } from "zod";

export const adminPatchUserSchema = z.object({
  accountStatus: z.enum(["active", "suspended", "banned"]).optional(),
  sellerVerified: z.boolean().optional()
});

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128)
});

export const adminPlatformSettingsSchema = z.object({
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
  momoEnabled: z.boolean().optional(),
  stripeEnabled: z.boolean().optional(),
  bankEnabled: z.boolean().optional(),
  listingPolicyNote: z.string().max(10000).optional()
});

export const adminReportPatchSchema = z.object({
  status: z.enum(["open", "in_review", "resolved", "dismissed"]),
  adminNote: z.string().max(4000).optional()
});

const orderStatusEnum = z.enum([
  "pending_payment",
  "awaiting_vendor_payment",
  "paid",
  "processing",
  "sent_for_delivery",
  "delivered",
  "cancelled"
]);

export const adminOrderPatchSchema = z.object({
  status: orderStatusEnum.optional(),
  disputeOpen: z.boolean().optional(),
  adminNote: z.string().max(4000).optional(),
  refundStatus: z.enum(["none", "requested", "refunded"]).optional()
});

export const adminProductPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  price: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  status: z.enum(["draft", "pending_approval", "active", "rejected"]).optional(),
  category: z.string().optional(),
  description: z.string().max(10000).optional(),
  flagged: z.boolean().optional()
});

export const adminRejectProductSchema = z.object({
  reason: z.string().trim().min(1).max(2000)
});

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

/** Express can surface duplicate query keys as arrays — take the first value. */
function firstQueryString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) {
    const x = v[0];
    return x === undefined || x === null ? undefined : String(x);
  }
  return String(v);
}

export const adminUsersQuerySchema = adminListQuerySchema.extend({
  role: z
    .preprocess((v) => firstQueryString(v) ?? "all", z.enum(["all", "buyer", "seller", "admin"])),
  accountStatus: z
    .preprocess(
      (v) => firstQueryString(v) ?? "all",
      z.enum(["all", "active", "suspended", "banned"])
    ),
  verified: z.preprocess((v) => firstQueryString(v) ?? "all", z.enum(["all", "yes", "no"])),
  search: z.preprocess(
    (v) => (firstQueryString(v) ?? "").trim(),
    z.string().max(200)
  )
});

export const adminProductsQuerySchema = adminListQuerySchema.extend({
  status: z.enum(["all", "draft", "pending_approval", "active", "rejected"]).optional().default("all"),
  flagged: z.enum(["all", "yes", "no"]).optional().default("all"),
  search: z.string().trim().max(200).optional().default("")
});

export const adminOrdersQuerySchema = adminListQuerySchema.extend({
  status: z
    .enum([
      "all",
      "pending_payment",
      "awaiting_vendor_payment",
      "paid",
      "processing",
      "sent_for_delivery",
      "delivered",
      "cancelled"
    ])
    .optional()
    .default("all"),
  dispute: z.enum(["all", "yes", "no"]).optional().default("all"),
  refund: z.enum(["all", "none", "requested", "refunded"]).optional().default("all"),
  search: z.string().trim().max(200).optional().default("")
});

export const adminReportsQuerySchema = adminListQuerySchema.extend({
  status: z.enum(["all", "open", "in_review", "resolved", "dismissed"]).optional().default("all"),
  search: z.string().trim().max(200).optional().default("")
});
