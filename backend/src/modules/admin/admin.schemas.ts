import { z } from "zod";
import { PRODUCT_CATEGORIES } from "../products/product.model";
import { ADMIN_PERMISSION_KEYS } from "./adminPermissions";

const adminPermissionKeySchema = z.enum(ADMIN_PERMISSION_KEYS);

export const adminPermissionsPatchSchema = z
  .record(adminPermissionKeySchema, z.boolean())
  .optional();

export const adminPatchUserSchema = z.object({
  accountStatus: z.enum(["active", "suspended", "banned"]).optional(),
  sellerVerified: z.boolean().optional(),
  vendorSubscriptionExempt: z.boolean().optional()
});

/** Super admin: promote a user to role `admin` by id or by email. */
export const grantAdminBodySchema = z.union([
  z.object({ userId: z.string().trim().min(1) }),
  z.object({ email: z.string().trim().email() })
]);

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128)
});

export const adminPlatformSettingsSchema = z.object({
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
  momoEnabled: z.boolean().optional(),
  stripeEnabled: z.boolean().optional(),
  bankEnabled: z.boolean().optional(),
  listingPolicyNote: z.string().max(10000).optional(),
  listingAllowedItemsNote: z.string().max(8000).optional(),
  listingProhibitedItemsNote: z.string().max(8000).optional(),
  listingModerationGuidelines: z.string().max(8000).optional(),
  listingAutoRejectKeywords: z
    .array(z.coerce.string())
    .max(50)
    .optional()
    .transform((arr) =>
      [...new Set((arr ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))]
        .slice(0, 50)
        .map((k) => k.slice(0, 64))
    ),
  listingAutoModerationEnabled: z.boolean().optional(),
  listingKeywordBlockEnabled: z.boolean().optional(),
  listingDefaultApprovalMode: z.enum(["require_approval", "auto_approve"]).optional(),
  listingKeywordViolationAction: z.enum(["reject_auto", "flag_review"]).optional(),
  siteName: z.string().trim().min(1).max(120).optional(),
  siteDescription: z.string().max(1000).optional(),
  supportEmail: z
    .union([z.literal(""), z.string().trim().email().max(200)])
    .optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(2000).optional(),
  allowPublicRegistration: z.boolean().optional(),
  allowVendorApplications: z.boolean().optional(),
  allowCourierApplications: z.boolean().optional(),
  platformDeployedAt: z.union([z.literal(""), z.string().trim().max(40)]).optional(),
  vendorTrialMonths: z.coerce.number().int().min(0).max(24).optional(),
  vendorSubscriptionBillingEnabled: z.boolean().optional(),
  vendorSubscriptionPriceGhs: z.coerce.number().min(0).max(100000).optional(),
  vendorSubscriptionPeriodMonths: z.coerce.number().int().min(1).max(36).optional(),
  adminPermissions: adminPermissionsPatchSchema
});

export const adminEmailTestSchema = z.object({
  to: z.string().trim().email().max(320),
  /** If omitted or blank, a professional default subject is used (includes site name). */
  subject: z.string().trim().max(200).optional(),
  /** Plain text only; converted to safe HTML (paragraphs and line breaks). If omitted or blank, a default verification copy is sent. */
  bodyText: z.string().max(8000).optional()
});

export const adminEmailLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(40)
});

export const adminReportPatchSchema = z.object({
  status: z.enum(["open", "in_review", "resolved", "dismissed"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
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
  refundStatus: z.enum(["none", "requested"]).optional()
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

/** Either approve by explicit ids, or approve all `pending_approval` rows matching optional search (capped server-side). */
export const adminApproveProductsBulkSchema = z
  .object({
    ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(250).optional(),
    approveAllPendingMatchingSearch: z.boolean().optional(),
    search: z.string().trim().max(200).optional().default("")
  })
  .superRefine((d, ctx) => {
    const all = d.approveAllPendingMatchingSearch === true;
    const hasIds = (d.ids?.length ?? 0) > 0;
    if (all === hasIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Use exactly one of: { "approveAllPendingMatchingSearch": true, "search": "..." } or { "ids": ["...", ...] }.',
        path: ["ids"]
      });
    }
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

/** Paginated courier accounts (+ RiderProfile) — separate from `GET /admin/users`. */
export const adminRidersQuerySchema = adminListQuerySchema.extend({
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

/** Super admin: create vendor directly or send activation email for guest email. */
export const adminCreateVendorSchema = z.object({
  email: z.string().trim().email(),
  password: z
    .union([z.literal(""), z.string().min(8).max(200)])
    .optional()
    .transform((p) => (typeof p === "string" ? p.trim() : "")),
  fullName: z.string().trim().min(2).max(120),
  shopName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(40),
  altPhone: z.string().trim().max(40).optional().default(""),
  category: z.enum(PRODUCT_CATEGORIES).optional().default("food_drinks"),
  shopDescription: z.string().trim().max(300).optional(),
  sellsDescription: z.string().trim().max(200).optional()
});

export const adminProductsQuerySchema = adminListQuerySchema.extend({
  status: z.enum(["all", "draft", "pending_approval", "active", "rejected"]).optional().default("all"),
  flagged: z.enum(["all", "yes", "no"]).optional().default("all"),
  search: z.string().trim().max(200).optional().default("")
});

export const adminBusinessesQuerySchema = adminListQuerySchema.extend({
  status: z
    .enum(["all", "draft", "pending_approval", "active", "rejected", "suspended"])
    .optional()
    .default("pending_approval"),
  search: z.string().trim().max(200).optional().default("")
});

export const adminRejectBusinessSchema = z.object({
  reason: z.string().max(500).optional().default("")
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
  refund: z.preprocess(
    (v) => firstQueryString(v) ?? "all",
    z.enum(["all", "none", "requested", "refund_processing", "refunded"])
  ),
  search: z.string().trim().max(200).optional().default("")
});

export const adminReportsQuerySchema = adminListQuerySchema.extend({
  status: z.enum(["all", "open", "in_review", "resolved", "dismissed"]).optional().default("all"),
  priority: z.enum(["all", "low", "medium", "high"]).optional().default("all"),
  search: z.string().trim().max(200).optional().default("")
});
