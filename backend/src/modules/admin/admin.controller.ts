import type { Request, Response } from "express";
import mongoose, { type HydratedDocument } from "mongoose";
import bcrypt from "bcrypt";
import { DEFAULT_SITE_NAME } from "../../config/brand";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { rewriteStoredMediaNullable, rewriteStoredMediaUrl } from "../../utils/publicMediaUrl";
import {
  env,
  getEmailTransportDiagnostics,
  getEmailTransportMode,
  isEmailTransportConfigured,
  isSuperUserAdminEmail
} from "../../config/env";
import { createOpaqueToken, sha256 } from "../auth/jwt";
import { sendEmail } from "../../utils/mailer";
import { buildVendorActivationEmailHtml, VENDOR_ACTIVATION_TTL_MS } from "../../utils/vendorActivationEmail";
import { EMAIL_TEMPLATE_PREVIEWS } from "../../utils/emailPreviewCatalog";
import { roundMoney, splitLineGross } from "../../utils/commission";
import { User, normalizeUserRole, publicPhoneForPaymentRole, type UserDoc, type RiderApplicationStatus } from "../auth/user.model";
import { Order, type OrderDoc } from "../orders/order.model";
import { isOrderExcludedFromRevenueMetrics, withContacts } from "../orders/orderSerialize";
import { Product } from "../products/product.model";
import { Business, type BusinessDoc } from "../businesses/business.model";
import { Conversation } from "../conversations/conversation.model";
import { Report } from "../reports/report.model";
import { Review } from "../reviews/review.model";
import { Token } from "../auth/token.model";
import { VendorAnalyticsEvent } from "../vendor/vendorAnalyticsEvent.model";
import { VendorApplication } from "../vendorApplications/vendorApplication.model";
import { adminVendorApplicationsQuerySchema, patchVendorApplicationSchema } from "../vendorApplications/vendorApplication.schemas";
import { CourierApplication } from "../courierApplications/courierApplication.model";
import { adminCourierApplicationsQuerySchema, patchCourierApplicationSchema } from "../courierApplications/courierApplication.schemas";
import { clearCommissionCache, getEffectiveCommissionPercent, getOrCreateSettings } from "../platform/platformSettings.service";
import {
  adminListQuerySchema,
  adminOrderPatchSchema,
  adminOrdersQuerySchema,
  adminEmailLogsQuerySchema,
  adminEmailTestSchema,
  adminPatchUserSchema,
  adminPlatformSettingsSchema,
  adminProductPatchSchema,
  adminProductsQuerySchema,
  adminBusinessesQuerySchema,
  adminRejectBusinessSchema,
  adminRejectProductSchema,
  adminApproveProductsBulkSchema,
  adminReportPatchSchema,
  adminReportsQuerySchema,
  adminResetPasswordSchema,
  adminUsersQuerySchema,
  grantAdminBodySchema
} from "./admin.schemas";
import { EmailLog } from "../emailLog/emailLog.model";
import { AdminAuditEvent, recordAdminAuditEvent } from "./adminAuditEvent.model";
import { createPaystackRefund, getPaystackRefundById } from "../payments/payments.controller";
import { applyProcessedPaystackRefundToOrder, isPaystackRefundRemoteSettled } from "../payments/paystackRefundSync";
import { conversationMessageSchema } from "../conversations/conversation.schemas";
import { getPrimarySupportAdminId } from "../conversations/supportPeer";
import { mirrorOrderStatusToDelivery } from "../deliveries/delivery.service";
import { RiderProfile } from "../deliveries/riderProfile.model";
import { Delivery } from "../deliveries/delivery.model";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text only — safe for email body (no HTML injection). */
function plainTextToEmailHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n\s*\n/)
    .map((block) => {
      const inner = block
        .split("\n")
        .map((line) => escapeHtmlEmail(line))
        .join("<br>");
      return `<p style="margin:0 0 1em 0;line-height:1.5">${inner}</p>`;
    })
    .join("");
}

function adminRoleGrantedEmailHtml(displayName: string, adminLoginUrl: string): string {
  const safeName = displayName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>Hi ${safeName || "there"},</p>
<p><strong>Your SHOPIQGH account has been granted administrator access.</strong></p>
<p>You can sign in to the admin dashboard with your existing email and password (and your usual sign-in code if required). Use this link when you’re ready:</p>
<p><a href="${adminLoginUrl}">${adminLoginUrl}</a></p>
<p>If you didn’t expect this email, contact your platform owner immediately.</p>
<p>— SHOPIQGH</p>`;
}

type AdminInviteEmailResult =
  | { status: "sent"; to: string }
  | { status: "no_recipient_email" }
  | { status: "mail_not_configured" }
  | { status: "send_failed" };

async function sendAdminRoleGrantedEmail(u: HydratedDocument<UserDoc>): Promise<AdminInviteEmailResult> {
  const to = (u.email || "").trim().toLowerCase();
  if (!to) {
    // eslint-disable-next-line no-console
    console.warn("[email] grant admin: user has no email on document", u._id.toString());
    return { status: "no_recipient_email" };
  }
  if (!isEmailTransportConfigured()) {
    // eslint-disable-next-line no-console
    console.warn("[email] grant admin: mailer not configured; recipient would be", to);
    return { status: "mail_not_configured" };
  }
  const display = (u.displayName || "").trim() || "there";
  const adminLoginUrl = `${env.APP_ORIGIN.replace(/\/$/, "")}/admin/login`;
  try {
    await sendEmail(
      to,
      "You’ve been granted admin access — SHOPIQGH",
      adminRoleGrantedEmailHtml(display, adminLoginUrl)
    );
    return { status: "sent", to };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[email] grant admin notify failed:", err);
    return { status: "send_failed" };
  }
}

function adminLevelForList(email: string | undefined, role: unknown): "super" | "normal" | undefined {
  if (normalizeUserRole(role) !== "admin") return undefined;
  return isSuperUserAdminEmail(email) ? "super" : "normal";
}

/** Stable key for a user row (lowercased email, else phone, else _id) — for deduping bad data. */
function userContactKey(u: { _id: mongoose.Types.ObjectId; email?: string; phone?: string }): string {
  const e = (u.email || "").trim().toLowerCase();
  if (e) return `e:${e}`;
  const p = (u.phone || "").trim();
  if (p) return `p:${p}`;
  return `id:${u._id.toString()}`;
}

/**
 * If the DB has duplicate user contacts (e.g. legacy data before a unique index), the admin
 * list would show the same name/email twice. Keep the oldest `createdAt` for each key.
 */
function dedupeUserDocsByContactOldestWins<
  T extends { _id: mongoose.Types.ObjectId; email?: string; phone?: string; createdAt?: Date }
>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const u of rows) {
    const k = userContactKey(u);
    const cur = byKey.get(k);
    if (!cur) {
      byKey.set(k, u);
      continue;
    }
    const tCur = new Date(cur.createdAt || 0).getTime();
    const tU = new Date(u.createdAt || 0).getTime();
    if (tU < tCur) byKey.set(k, u);
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

const BCRYPT_SALT = 12;

const PAID_LIKE = ["paid", "processing", "sent_for_delivery", "delivered"] as const;

/**
 * Lightweight, polling-friendly counts of items needing admin attention. Used by the admin
 * shell sidebar to show "you've got mail" badges next to Orders, Vendor requests, Listings,
 * and Reports — the same affordance vendors already get for incoming orders.
 */
export const adminBadges = asyncHandler(async (_req: Request, res: Response) => {
  const [pendingOrders, pendingVendorApps, pendingCourierApps, pendingProducts, pendingStores, openReports, openDisputes] =
    await Promise.all([
      Order.countDocuments({ status: { $in: ["pending_payment", "awaiting_vendor_payment"] } }),
      VendorApplication.countDocuments({ status: "pending" }),
      CourierApplication.countDocuments({ status: "pending" }),
      Product.countDocuments({ status: "pending_approval" }),
      Business.countDocuments({ status: "pending_approval" }),
      Report.countDocuments({ status: { $in: ["open", "in_review"] } }),
      Order.countDocuments({ disputeOpen: true })
    ]);

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    badges: {
      orders: pendingOrders,
      "vendor-apps": pendingVendorApps,
      "courier-apps": pendingCourierApps,
      listings: pendingProducts,
      stores: pendingStores,
      reports: openReports,
      disputes: openDisputes
    },
    fetchedAt: new Date().toISOString()
  });
});

export const adminDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const [buyerCount, sellerCount, adminCount, orderCount, productActive, productPending, productDraft, productRejected, openReports] = await Promise.all([
    User.countDocuments({ role: "buyer" }),
    User.countDocuments({ role: "seller" }),
    User.countDocuments({ role: "admin" }),
    Order.countDocuments(),
    Product.countDocuments({ status: "active" }),
    Product.countDocuments({ status: "pending_approval" }),
    Product.countDocuments({ status: "draft" }),
    Product.countDocuments({ status: "rejected" }),
    Report.countDocuments({ status: { $in: ["open", "in_review"] } })
  ]);

  const orders = await Order.find({ status: { $in: [...PAID_LIKE] } })
    .select("items subtotal")
    .lean();
  let platformRevenue = 0;
  for (const o of orders) {
    for (const it of o.items) {
      const g = roundMoney((it as { unitPrice: number; quantity: number }).unitPrice * (it as { quantity: number }).quantity);
      if (typeof (it as { platformFee?: number }).platformFee === "number") {
        platformRevenue += (it as { platformFee: number }).platformFee;
      } else {
        platformRevenue += splitLineGross(g).platformFee;
      }
    }
  }
  platformRevenue = roundMoney(platformRevenue);
  const commissionPercent = await getEffectiveCommissionPercent();

  /** Per-source cap for admin System logs (merged + time-sorted in the UI). */
  const RECENT_LOG_EACH = 30;

  const recentOrders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(RECENT_LOG_EACH)
    .lean();
  const recentSerialized = await withContacts(recentOrders as unknown as Record<string, unknown>[]);

  const recentSignups = await User.find()
    .select("email displayName role createdAt")
    .sort({ createdAt: -1 })
    .limit(RECENT_LOG_EACH)
    .lean();
  const recentListings = await Product.find()
    .select("name status sellerId createdAt")
    .sort({ createdAt: -1 })
    .limit(RECENT_LOG_EACH)
    .lean();

  const [recentReports, recentVendorApps, recentAudit] = await Promise.all([
    Report.find()
      .select("category status targetType createdAt")
      .sort({ createdAt: -1 })
      .limit(RECENT_LOG_EACH)
      .lean(),
    VendorApplication.find()
      .select("shopName status email createdAt")
      .sort({ createdAt: -1 })
      .limit(RECENT_LOG_EACH)
      .lean(),
    AdminAuditEvent.find().sort({ createdAt: -1 }).limit(RECENT_LOG_EACH).lean()
  ]);
  const auditActorIds = [...new Set(recentAudit.map((e) => e.actorId.toString()))];
  const auditActors = auditActorIds.length
    ? await User.find({ _id: { $in: auditActorIds.map((x) => new mongoose.Types.ObjectId(x)) } })
        .select("displayName email")
        .lean()
    : [];
  const auditActorLabel = new Map(
    auditActors.map((x) => [
      x._id.toString(),
      ((x as { displayName?: string; email?: string }).displayName || "").trim() ||
        (x as { email?: string }).email ||
        "—"
    ])
  );
  const listSellerIds = [...new Set(recentListings.map((p) => p.sellerId.toString()))];
  const listSellers = listSellerIds.length
    ? await User.find({ _id: { $in: listSellerIds.map((x) => new mongoose.Types.ObjectId(x)) } })
        .select("displayName email")
        .lean()
    : [];
  const bySeller = new Map(
    listSellers.map((u) => [u._id.toString(), ((u as { displayName?: string; email?: string }).displayName || "").trim() || (u as { email?: string }).email || "—"])
  );

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    users: {
      total: buyerCount + sellerCount + adminCount,
      buyers: buyerCount,
      sellers: sellerCount,
      admins: adminCount
    },
    products: {
      active: productActive,
      pendingApproval: productPending,
      draft: productDraft,
      rejected: productRejected
    },
    orders: { total: orderCount },
    revenue: {
      platformCommissionTotal: platformRevenue,
      platformCommissionPercent: commissionPercent
    },
    flags: {
      openReports
    },
    recent: {
      orders: recentSerialized.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt
      })),
      signups: recentSignups.map((u) => ({
        id: u._id.toString(),
        email: (u as { email?: string }).email ?? "",
        displayName: (u as { displayName?: string }).displayName ?? "",
        role: (u as { role: string }).role,
        createdAt: u.createdAt
      })),
      listings: recentListings.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        status: p.status,
        sellerLabel: bySeller.get(p.sellerId.toString()) || "—",
        createdAt: p.createdAt
      })),
      reports: recentReports.map((r) => ({
        id: r._id.toString(),
        category: r.category,
        status: r.status,
        targetType: r.targetType,
        createdAt: r.createdAt
      })),
      vendorApplications: recentVendorApps.map((a) => ({
        id: a._id.toString(),
        shopName: a.shopName,
        status: a.status,
        email: a.email,
        createdAt: a.createdAt
      })),
      audit: recentAudit.map((e) => ({
        id: e._id.toString(),
        action: e.action,
        title: e.title,
        detail: e.detail,
        actorLabel: auditActorLabel.get(e.actorId.toString()) || "—",
        createdAt: e.createdAt
      }))
    }
  });
});

export const listAdminUsers = asyncHandler(async (req: Request, res: Response) => {
  const q = adminUsersQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const filter: Record<string, unknown> = {};
  if (q.role !== "all") filter.role = q.role;
  else filter.role = { $ne: "rider" };
  if (q.accountStatus !== "all") filter.accountStatus = q.accountStatus;
  if (q.verified !== "all") filter.sellerVerified = q.verified === "yes";
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ email: re }, { displayName: re }];
  }
  const [rows, total, counts] = await Promise.all([
    User.find(filter)
      .select("email phone displayName role accountStatus sellerVerified createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(q.limit)
      .lean(),
    User.countDocuments(filter),
    Promise.all([
      User.countDocuments({ role: "buyer" }),
      User.countDocuments({ role: "seller" }),
      User.countDocuments({ role: "admin" })
    ])
  ]);
  const rowsDeduped = dedupeUserDocsByContactOldestWins(
    rows as { _id: mongoose.Types.ObjectId; email?: string; phone?: string; createdAt?: Date }[]
  ) as unknown as typeof rows;
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    users: rowsDeduped.map((u) => {
      const role = (u as { role: string }).role;
      return {
        id: u._id.toString(),
        email: u.email ?? "",
        phone: publicPhoneForPaymentRole(normalizeUserRole((u as { role: string }).role), (u as { phone?: string }).phone),
        displayName: (u as { displayName?: string }).displayName ?? "",
        role,
        adminLevel: adminLevelForList((u as { email?: string }).email, role),
        accountStatus: (u as { accountStatus?: string }).accountStatus ?? "active",
        sellerVerified: Boolean((u as { sellerVerified?: boolean }).sellerVerified),
        createdAt: u.createdAt
      };
    }),
    total,
    page: q.page,
    limit: q.limit,
    counts: { buyers: counts[0], sellers: counts[1], admins: counts[2], all: counts[0] + counts[1] + counts[2] }
  });
});

export const patchAdminUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid user id");
  const body = adminPatchUserSchema.parse(req.body);
  const u = await User.findById(id);
  if (!u) throw new HttpError(404, "User not found");
  const isSelf = String(u._id) === String(req.user?.id);
  if (normalizeUserRole((u as { role: string }).role) === "admin" && !isSelf && req.user?.adminLevel !== "super") {
    throw new HttpError(403, "Only the platform super admin can change another administrator's account.");
  }
  if (
    body.accountStatus != null &&
    body.accountStatus !== "active" &&
    isSuperUserAdminEmail((u as { email?: string }).email)
  ) {
    throw new HttpError(403, "Cannot suspend or ban a platform super-admin account.");
  }
  if (u.role === "admin" && (body as { accountStatus?: string }).accountStatus && (body as { accountStatus: string }).accountStatus !== "active") {
    const admins = await User.countDocuments({ role: "admin" });
    if (admins <= 1) throw new HttpError(400, "Cannot change the only admin account this way");
  }
  if (body.accountStatus !== undefined) (u as { accountStatus: string }).accountStatus = body.accountStatus;
  if (body.sellerVerified !== undefined) (u as { sellerVerified: boolean }).sellerVerified = body.sellerVerified;
  if (body.vendorSubscriptionExempt !== undefined) {
    (u as { vendorSubscriptionExempt: boolean }).vendorSubscriptionExempt = body.vendorSubscriptionExempt;
  }
  await u.save();
  const parts: string[] = [];
  if (body.accountStatus !== undefined) parts.push(`accountStatus → ${body.accountStatus}`);
  if (body.sellerVerified !== undefined) parts.push(`sellerVerified → ${body.sellerVerified}`);
  if (body.vendorSubscriptionExempt !== undefined) {
    parts.push(`vendorSubscriptionExempt → ${body.vendorSubscriptionExempt}`);
  }
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "user.patch",
    title: `User updated — ${(((u as { email?: string }).email || (u as { displayName?: string }).displayName || id) + "").slice(0, 60)}`,
    detail: parts.join(" · ") || "—"
  });
  res.json({
    ok: true,
    user: {
      id: u._id.toString(),
      accountStatus: (u as { accountStatus?: string }).accountStatus,
      sellerVerified: (u as { sellerVerified?: boolean }).sellerVerified,
      vendorSubscriptionExempt: Boolean((u as { vendorSubscriptionExempt?: boolean }).vendorSubscriptionExempt)
    }
  });
});

export const grantAdmin = asyncHandler(async (req: Request, res: Response) => {
  const body = grantAdminBodySchema.parse(req.body);
  let u: HydratedDocument<UserDoc> | null;
  if ("userId" in body) {
    if (!mongoose.isValidObjectId(body.userId)) throw new HttpError(400, "Invalid user id");
    u = await User.findById(body.userId);
  } else {
    u = await User.findOne({ email: body.email.trim().toLowerCase() });
  }
  if (!u) throw new HttpError(404, "User not found");
  if (normalizeUserRole(u.role) === "admin") {
    res.json({ ok: true, already: true, user: { id: u._id.toString(), role: "admin" } });
    return;
  }
  const acc = (u as { accountStatus?: string }).accountStatus;
  if (acc && acc !== "active") {
    throw new HttpError(400, "Only active accounts can be made admin. Restore the account first.");
  }
  u.role = "admin";
  await u.save();
  const adminInviteEmail = await sendAdminRoleGrantedEmail(u);
  const targetLabel = ((u.displayName || "").trim() || u.email || u._id.toString()).slice(0, 80);
  const inviteDetailStr =
    adminInviteEmail.status === "sent"
      ? `${adminInviteEmail.status} → ${adminInviteEmail.to}`
      : adminInviteEmail.status;
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "admin.grant",
    title: `Granted admin — ${targetLabel}`,
    detail: `${(u.email || "").trim() || "no email"} · invite ${inviteDetailStr}`
  });
  res.json({
    ok: true,
    user: { id: u._id.toString(), role: "admin" },
    adminInviteEmail
  });
});

export const revokeAdmin = asyncHandler(async (req: Request, res: Response) => {
  const body = grantAdminBodySchema.parse(req.body);
  let u: HydratedDocument<UserDoc> | null;
  if ("userId" in body) {
    if (!mongoose.isValidObjectId(body.userId)) throw new HttpError(400, "Invalid user id");
    u = await User.findById(body.userId);
  } else {
    u = await User.findOne({ email: body.email.trim().toLowerCase() });
  }
  if (!u) throw new HttpError(404, "User not found");
  if (String(u._id) === String(req.user?.id)) {
    throw new HttpError(400, "You cannot remove your own admin access.");
  }
  if (normalizeUserRole(u.role) !== "admin") {
    res.json({ ok: true, already: true, user: { id: u._id.toString(), role: normalizeUserRole(u.role) } });
    return;
  }
  const uEmail = (u as { email?: string }).email;
  if (isSuperUserAdminEmail(uEmail)) {
    throw new HttpError(403, "Cannot remove admin from a platform super-admin account.");
  }
  const admins = await User.countDocuments({ role: "admin" });
  if (admins <= 1) {
    throw new HttpError(400, "Cannot remove the only administrator. Grant another admin first.");
  }
  const listingCount = await Product.countDocuments({ sellerId: u._id });
  const nextRole: UserDoc["role"] = listingCount > 0 ? "seller" : "buyer";
  u.role = nextRole;
  await u.save();
  const who = ((u.displayName || "").trim() || uEmail || u._id.toString()).slice(0, 80);
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "admin.revoke",
    title: `Removed admin — ${who}`,
    detail: `Now ${nextRole} · ${(uEmail || "").trim() || "—"}`
  });
  res.json({ ok: true, user: { id: u._id.toString(), role: nextRole } });
});

export const listAdminProducts = asyncHandler(async (req: Request, res: Response) => {
  const q = adminProductsQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const filter: Record<string, unknown> = {};
  if (q.status && q.status !== "all") filter.status = q.status;
  if (q.flagged === "yes") filter.flagged = true;
  if (q.flagged === "no") filter.flagged = { $ne: true };
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ name: re }, { description: re }];
  }
  const [rows, total] = await Promise.all([
    Product.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(q.limit).lean(),
    Product.countDocuments(filter)
  ]);
  const sellerIds = [...new Set(rows.map((r) => r.sellerId.toString()))];
  const names = await User.find({ _id: { $in: sellerIds.map((x) => new mongoose.Types.ObjectId(x)) } })
    .select("displayName email")
    .lean();
  const bySeller = new Map(
    names.map((u) => [u._id.toString(), ((u as { displayName?: string; email?: string }).displayName || "").trim() || (u as { email?: string }).email || "—"])
  );
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    products: rows.map((p) => ({
      id: p._id.toString(),
      sellerId: p.sellerId.toString(),
      sellerLabel: bySeller.get(p.sellerId.toString()) || "—",
      name: p.name,
      category: p.category,
      status: p.status,
      rejectionReason: p.rejectionReason,
      flagged: Boolean((p as { flagged?: boolean }).flagged),
      price: p.price,
      stock: p.stock,
      description: p.description,
      imageUrls: ((p as { imageUrls?: string[] }).imageUrls || []).map((u) =>
        typeof u === "string" ? rewriteStoredMediaUrl(u) : u
      ),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    })),
    total,
    page: q.page,
    limit: q.limit
  });
});

const ADMIN_BULK_APPROVE_PENDING_CAP = 400;

/** Approve many listings in one round-trip (explicit ids or all pending matching search). */
export const approveProductsBulk = asyncHandler(async (req: Request, res: Response) => {
  const body = adminApproveProductsBulkSchema.parse(req.body);

  if (body.ids && body.ids.length > 0) {
    const ids = [...new Set(body.ids)];
    const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
    const result = await Product.updateMany(
      { _id: { $in: oids }, status: { $in: ["pending_approval", "draft", "rejected"] } },
      { $set: { status: "active", rejectionReason: null } }
    );
    await recordAdminAuditEvent({
      actorId: req.user?.id,
      action: "product.approve_bulk",
      title: `Bulk-approved ${result.modifiedCount} listing(s) (by id)`,
      detail: `${ids.length} id(s) requested · matched ${result.matchedCount}`
    });
    res.json({
      ok: true,
      mode: "ids" as const,
      requested: ids.length,
      approved: result.modifiedCount,
      matched: result.matchedCount
    });
    return;
  }

  const filter: Record<string, unknown> = { status: "pending_approval" };
  const q = typeof body.search === "string" ? body.search.trim() : "";
  if (q.length > 0) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: re }, { description: re }];
  }

  const batch = await Product.find(filter)
    .sort({ updatedAt: -1 })
    .limit(ADMIN_BULK_APPROVE_PENDING_CAP)
    .select("_id")
    .lean();

  const idBatch = batch.map((d) => d._id);

  if (idBatch.length === 0) {
    res.json({
      ok: true,
      mode: "approveAllPendingMatchingSearch" as const,
      approved: 0,
      scanned: 0,
      batchCap: ADMIN_BULK_APPROVE_PENDING_CAP,
      repeatSuggested: false
    });
    return;
  }

  const result = await Product.updateMany(
    { _id: { $in: idBatch }, status: "pending_approval" },
    { $set: { status: "active", rejectionReason: null } }
  );

  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "product.approve_bulk",
    title: `Bulk-approved ${result.modifiedCount} pending listing(s)`,
    detail: q ? `search “${q.slice(0, 120)}${q.length > 120 ? "…" : ""}” · batch ${idBatch.length}` : `batch ${idBatch.length}`
  });

  res.json({
    ok: true,
    mode: "approveAllPendingMatchingSearch" as const,
    approved: result.modifiedCount,
    scanned: idBatch.length,
    batchCap: ADMIN_BULK_APPROVE_PENDING_CAP,
    repeatSuggested: batch.length >= ADMIN_BULK_APPROVE_PENDING_CAP
  });
});

export const approveProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  if (p.status === "rejected" || p.status === "pending_approval" || p.status === "draft") {
    p.status = "active";
  }
  p.set("rejectionReason", null);
  await p.save();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "product.approve",
    title: `Listing approved — ${p.name.slice(0, 80)}`,
    detail: p._id.toString()
  });
  res.json({ ok: true, product: { id: p._id.toString(), status: p.status } });
});

export const rejectProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const { reason } = adminRejectProductSchema.parse(req.body);
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  p.status = "rejected";
  p.set("rejectionReason", reason);
  await p.save();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "product.reject",
    title: `Listing rejected — ${p.name.slice(0, 80)}`,
    detail: reason.slice(0, 500)
  });
  res.json({ ok: true, product: { id: p._id.toString(), status: p.status, rejectionReason: reason } });
});

function serializeAdminBusiness(b: BusinessDoc) {
  return {
    id: b._id.toString(),
    ownerId: b.ownerId.toString(),
    slug: b.slug,
    businessType: b.businessType,
    status: b.status,
    name: b.name,
    description: b.description,
    logoUrl: rewriteStoredMediaNullable(b.logoUrl ?? null),
    bannerUrl: rewriteStoredMediaNullable(b.bannerUrl ?? null),
    locationLabel: b.locationLabel,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
  };
}

export const listAdminBusinesses = asyncHandler(async (req: Request, res: Response) => {
  const q = adminBusinessesQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const filter: Record<string, unknown> = {};
  if (q.status && q.status !== "all") filter.status = q.status;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ name: rx }, { slug: rx }, { description: rx }];
  }
  const [rows, total] = await Promise.all([
    Business.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(q.limit).lean(),
    Business.countDocuments(filter)
  ]);
  res.json({
    businesses: rows.map((r) => serializeAdminBusiness(r as BusinessDoc)),
    total,
    page: q.page,
    limit: q.limit
  });
});

export const approveAdminBusiness = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid store id");
  const doc = await Business.findById(id);
  if (!doc) throw new HttpError(404, "Store not found");
  if (doc.status === "suspended") throw new HttpError(400, "Suspended stores must be unsuspended before approval.");
  doc.status = "active";
  const settings = (doc.settings && typeof doc.settings === "object" ? { ...doc.settings } : {}) as Record<
    string,
    unknown
  >;
  delete settings.rejectionReason;
  doc.settings = settings;
  await doc.save();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "business.approve",
    title: `Store approved — ${doc.name.slice(0, 80)}`,
    detail: doc.slug
  });
  res.json({ ok: true, business: serializeAdminBusiness(doc.toObject() as BusinessDoc) });
});

export const rejectAdminBusiness = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid store id");
  const { reason } = adminRejectBusinessSchema.parse(req.body);
  const doc = await Business.findById(id);
  if (!doc) throw new HttpError(404, "Store not found");
  doc.status = "rejected";
  const settings = (doc.settings && typeof doc.settings === "object" ? { ...doc.settings } : {}) as Record<
    string,
    unknown
  >;
  if (reason.trim()) settings.rejectionReason = reason.trim();
  else delete settings.rejectionReason;
  doc.settings = settings;
  await doc.save();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "business.reject",
    title: `Store rejected — ${doc.name.slice(0, 80)}`,
    detail: reason.slice(0, 500) || doc.slug
  });
  res.json({ ok: true, business: serializeAdminBusiness(doc.toObject() as BusinessDoc) });
});

export const listAdminOrders = asyncHandler(async (req: Request, res: Response) => {
  const q = adminOrdersQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const conditions: Record<string, unknown>[] = [];

  if (q.status && q.status !== "all") conditions.push({ status: q.status });
  if (q.dispute === "yes") conditions.push({ disputeOpen: true });
  if (q.dispute === "no") conditions.push({ disputeOpen: { $ne: true } });

  if (q.refund !== "all") {
    if (q.refund === "refunded") {
      conditions.push({
        $or: [
          { paymentMethod: { $ne: "paystack" }, refundStatus: "refunded" },
          {
            paymentMethod: "paystack",
            refundStatus: "refunded",
            paystackRefundRemoteStatus: "processed"
          }
        ]
      });
    } else {
      conditions.push({ refundStatus: q.refund });
    }
  }

  if (q.search) {
    const s = q.search.trim();
    const re = new RegExp(escapeRegex(s), "i");
    const or: Record<string, unknown>[] = [{ "items.name": re }];
    if (mongoose.isValidObjectId(s)) {
      or.push({ _id: new mongoose.Types.ObjectId(s) });
    }
    conditions.push({ $or: or });
  }

  const filter: Record<string, unknown> = conditions.length ? { $and: conditions } : {};
  const [rows, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit).lean(),
    Order.countDocuments(filter)
  ]);
  const serialized = await withContacts(rows as unknown as Record<string, unknown>[]);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    orders: serialized,
    total,
    page: q.page,
    limit: q.limit
  });
});

function serializePlatformSettingsDoc(doc: Awaited<ReturnType<typeof getOrCreateSettings>>) {
  const tail = (doc.listingRulesAuditTail || []).map((e) => ({
    at: e.at instanceof Date ? e.at.toISOString() : String(e.at),
    actorUserId: e.actorUserId,
    summary: e.summary
  }));
  return {
    commissionPercent: doc.commissionPercent,
    momoEnabled: doc.momoEnabled,
    stripeEnabled: doc.stripeEnabled,
    bankEnabled: doc.bankEnabled,
    listingPolicyNote: doc.listingPolicyNote || "",
    listingAllowedItemsNote: doc.listingAllowedItemsNote || "",
    listingProhibitedItemsNote: doc.listingProhibitedItemsNote || "",
    listingModerationGuidelines: doc.listingModerationGuidelines || "",
    listingAutoRejectKeywords: Array.isArray(doc.listingAutoRejectKeywords) ? doc.listingAutoRejectKeywords : [],
    listingAutoModerationEnabled: !!doc.listingAutoModerationEnabled,
    listingKeywordBlockEnabled: !!doc.listingKeywordBlockEnabled,
    listingDefaultApprovalMode:
      doc.listingDefaultApprovalMode === "auto_approve" ? "auto_approve" : "require_approval",
    listingKeywordViolationAction:
      doc.listingKeywordViolationAction === "reject_auto" ? "reject_auto" : "flag_review",
    listingRulesVersion: doc.listingRulesVersion ?? 1,
    listingRulesUpdatedAt: doc.listingRulesUpdatedAt
      ? (doc.listingRulesUpdatedAt as Date).toISOString()
      : null,
    listingRulesAuditTail: tail,
    siteName: doc.siteName || DEFAULT_SITE_NAME,
    siteDescription: doc.siteDescription || "",
    supportEmail: (doc.supportEmail || "").trim(),
    maintenanceMode: !!doc.maintenanceMode,
    maintenanceMessage: doc.maintenanceMessage || "",
    allowPublicRegistration: doc.allowPublicRegistration !== false,
    allowVendorApplications: doc.allowVendorApplications !== false,
    allowCourierApplications: doc.allowCourierApplications !== false,
    platformDeployedAt: doc.platformDeployedAt
      ? (doc.platformDeployedAt as Date).toISOString()
      : null,
    vendorTrialMonths: doc.vendorTrialMonths ?? 2,
    vendorSubscriptionBillingEnabled: doc.vendorSubscriptionBillingEnabled !== false,
    vendorSubscriptionPriceGhs: doc.vendorSubscriptionPriceGhs ?? 49,
    vendorSubscriptionPeriodMonths: doc.vendorSubscriptionPeriodMonths ?? 12
  };
}

export const getAdminPlatformSettings = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await getOrCreateSettings();
  let listingRulesLastEditor: { id: string; label: string } | null = null;
  if (doc.listingRulesUpdatedByUserId) {
    const ed = await User.findById(doc.listingRulesUpdatedByUserId).select("displayName email").lean();
    if (ed) {
      const id = (ed as { _id: mongoose.Types.ObjectId })._id.toString();
      const displayName = String((ed as { displayName?: string }).displayName || "").trim();
      const email = String((ed as { email?: string }).email || "").trim();
      listingRulesLastEditor = { id, label: displayName || email || id };
    }
  }
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    settings: serializePlatformSettingsDoc(doc),
    listingRulesLastEditor,
    emailDelivery: {
      from: env.EMAIL_FROM,
      transport: getEmailTransportMode(),
      configured: isEmailTransportConfigured(),
      diagnostics: getEmailTransportDiagnostics()
    },
    emailTemplatePreviews: EMAIL_TEMPLATE_PREVIEWS,
    effectiveCommissionPercent: doc.commissionPercent
  });
});

export const patchAdminPlatformSettings = asyncHandler(async (req: Request, res: Response) => {
  const body = adminPlatformSettingsSchema.parse(req.body);
  const doc = await getOrCreateSettings();
  if (body.commissionPercent !== undefined) doc.commissionPercent = body.commissionPercent;
  if (body.momoEnabled !== undefined) doc.momoEnabled = body.momoEnabled;
  if (body.stripeEnabled !== undefined) doc.stripeEnabled = body.stripeEnabled;
  if (body.bankEnabled !== undefined) doc.bankEnabled = body.bankEnabled;
  if (body.listingPolicyNote !== undefined) doc.listingPolicyNote = body.listingPolicyNote;
  if (body.listingAllowedItemsNote !== undefined) doc.listingAllowedItemsNote = body.listingAllowedItemsNote;
  if (body.listingProhibitedItemsNote !== undefined) doc.listingProhibitedItemsNote = body.listingProhibitedItemsNote;
  if (body.listingModerationGuidelines !== undefined) doc.listingModerationGuidelines = body.listingModerationGuidelines;
  if (body.listingAutoRejectKeywords !== undefined) doc.listingAutoRejectKeywords = body.listingAutoRejectKeywords;
  if (body.listingAutoModerationEnabled !== undefined) doc.listingAutoModerationEnabled = body.listingAutoModerationEnabled;
  if (body.listingKeywordBlockEnabled !== undefined) doc.listingKeywordBlockEnabled = body.listingKeywordBlockEnabled;
  if (body.listingDefaultApprovalMode !== undefined) doc.listingDefaultApprovalMode = body.listingDefaultApprovalMode;
  if (body.listingKeywordViolationAction !== undefined) doc.listingKeywordViolationAction = body.listingKeywordViolationAction;
  if (body.siteName !== undefined) doc.siteName = body.siteName.trim();
  if (body.siteDescription !== undefined) doc.siteDescription = body.siteDescription;
  if (body.supportEmail !== undefined) doc.supportEmail = body.supportEmail.trim();
  if (body.maintenanceMode !== undefined) doc.maintenanceMode = body.maintenanceMode;
  if (body.maintenanceMessage !== undefined) doc.maintenanceMessage = body.maintenanceMessage;
  if (body.allowPublicRegistration !== undefined) doc.allowPublicRegistration = body.allowPublicRegistration;
  if (body.allowVendorApplications !== undefined) doc.allowVendorApplications = body.allowVendorApplications;
  if (body.allowCourierApplications !== undefined) doc.allowCourierApplications = body.allowCourierApplications;
  if (body.platformDeployedAt !== undefined) {
    if (body.platformDeployedAt === "") {
      doc.platformDeployedAt = null;
    } else {
      const d = new Date(String(body.platformDeployedAt));
      if (Number.isNaN(d.getTime())) throw new HttpError(400, "Invalid platform deployment date.");
      doc.platformDeployedAt = d;
    }
  }
  if (body.vendorTrialMonths !== undefined) doc.vendorTrialMonths = body.vendorTrialMonths;
  if (body.vendorSubscriptionBillingEnabled !== undefined) {
    doc.vendorSubscriptionBillingEnabled = body.vendorSubscriptionBillingEnabled;
  }
  if (body.vendorSubscriptionPriceGhs !== undefined) doc.vendorSubscriptionPriceGhs = body.vendorSubscriptionPriceGhs;
  if (body.vendorSubscriptionPeriodMonths !== undefined) {
    doc.vendorSubscriptionPeriodMonths = body.vendorSubscriptionPeriodMonths;
  }

  const listingRuleKeys = [
    "listingPolicyNote",
    "listingAllowedItemsNote",
    "listingProhibitedItemsNote",
    "listingModerationGuidelines",
    "listingAutoRejectKeywords",
    "listingAutoModerationEnabled",
    "listingKeywordBlockEnabled",
    "listingDefaultApprovalMode",
    "listingKeywordViolationAction"
  ] as const;
  const listingRulesTouched = listingRuleKeys.some((k) => body[k] !== undefined);
  if (listingRulesTouched) {
    const nextV = (Number(doc.listingRulesVersion) || 1) + 1;
    doc.listingRulesVersion = nextV;
    doc.listingRulesUpdatedAt = new Date();
    doc.listingRulesUpdatedByUserId = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null;
    const kwN = (doc.listingAutoRejectKeywords || []).length;
    const summary = `Listing rules v${nextV} · autoMod=${doc.listingAutoModerationEnabled} kwBlock=${doc.listingKeywordBlockEnabled} · ${kwN} keywords · ${doc.listingDefaultApprovalMode} · ${doc.listingKeywordViolationAction}`;
    doc.listingRulesAuditTail = [
      { at: new Date(), actorUserId: req.user?.id || "unknown", summary: summary.slice(0, 500) },
      ...(doc.listingRulesAuditTail || [])
    ].slice(0, 20);
  }

  await doc.save();
  clearCommissionCache();
  const parts: string[] = [];
  if (body.commissionPercent !== undefined) parts.push(`commission ${body.commissionPercent}%`);
  if (body.momoEnabled !== undefined) parts.push(`momo ${body.momoEnabled ? "on" : "off"}`);
  if (body.stripeEnabled !== undefined) parts.push(`card ${body.stripeEnabled ? "on" : "off"}`);
  if (body.bankEnabled !== undefined) parts.push(`bank ${body.bankEnabled ? "on" : "off"}`);
  if (body.listingPolicyNote !== undefined) parts.push("listing policy note updated");
  if (listingRulesTouched) parts.push(`listing rules v${doc.listingRulesVersion}`);
  if (body.siteName !== undefined) parts.push(`site name “${body.siteName.trim().slice(0, 40)}”`);
  if (body.siteDescription !== undefined) parts.push("site description updated");
  if (body.supportEmail !== undefined) parts.push(body.supportEmail ? "support email set" : "support email cleared");
  if (body.maintenanceMode !== undefined) parts.push(`maintenance ${body.maintenanceMode ? "on" : "off"}`);
  if (body.maintenanceMessage !== undefined) parts.push("maintenance message updated");
  if (body.allowPublicRegistration !== undefined) parts.push(`signup ${body.allowPublicRegistration ? "open" : "closed"}`);
  if (body.allowVendorApplications !== undefined) parts.push(`vendor apps ${body.allowVendorApplications ? "open" : "closed"}`);
  if (body.allowCourierApplications !== undefined) parts.push(`courier apps ${body.allowCourierApplications ? "open" : "closed"}`);
  if (body.platformDeployedAt !== undefined) parts.push("deployment date updated");
  if (body.vendorTrialMonths !== undefined) parts.push(`vendor trial ${body.vendorTrialMonths} mo`);
  if (body.vendorSubscriptionBillingEnabled !== undefined) {
    parts.push(`seller billing ${body.vendorSubscriptionBillingEnabled ? "on" : "off"}`);
  }
  if (body.vendorSubscriptionPriceGhs !== undefined) parts.push(`seller fee GHS ${body.vendorSubscriptionPriceGhs}`);
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "settings.platform",
    title: "Platform settings saved",
    detail: parts.join(" · ") || "—"
  });
  res.json({ ok: true, settings: serializePlatformSettingsDoc(doc) });
});

export const postAdminSettingsEmailTest = asyncHandler(async (req: Request, res: Response) => {
  const { to, subject: subjectRaw, bodyText: bodyRaw } = adminEmailTestSchema.parse(req.body);
  const diag = getEmailTransportDiagnostics();
  if (!diag.configured) {
    const missing =
      diag.missingVariables.length > 0
        ? `Missing or empty environment variables: ${diag.missingVariables.join(", ")}. `
        : "";
    const hint = diag.hints.length > 0 ? diag.hints.join(" ") : "Edit backend/.env and restart the API.";
    throw new HttpError(400, `${missing}${hint}`.trim());
  }
  const doc = await getOrCreateSettings();
  const siteName = ((doc.siteName || DEFAULT_SITE_NAME).trim() || DEFAULT_SITE_NAME).slice(0, 120);
  const subjectIn = (subjectRaw || "").trim();
  const bodyIn = (bodyRaw || "").trim();
  const subject = subjectIn || `${siteName} — outbound mail verification`;
  const sentAt = new Date().toISOString();
  const html = bodyIn
    ? plainTextToEmailHtml(bodyIn)
    : `<p>This message confirms that <strong>${escapeHtmlEmail(siteName)}</strong> can deliver email from your configured server.</p>
<p>It was sent from the administrator mail tools. Recipients do not need to take any action.</p>
<p style="color:#64748b;font-size:12px;margin-top:1.25em">${escapeHtmlEmail(sentAt)}</p>`;

  const safeTo = to.trim().toLowerCase();
  const mail = await sendEmail(safeTo, subject.slice(0, 200), html, { category: "admin_outbound" });
  if (!mail.ok) {
    throw new HttpError(
      502,
      `Mail server rejected or failed the send: ${mail.reason}. Check your SMTP/Gmail credentials and that EMAIL_FROM is allowed by your provider.`
    );
  }
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "settings.outbound_mail",
    title: "Sent email from admin",
    detail: `to ${safeTo} · ${subject.slice(0, 120)}`
  });
  res.json({
    ok: true,
    sentAt,
    to: safeTo,
    subject,
    message: `Your message was accepted for delivery to ${safeTo}. It may take a few minutes to arrive; check spam or your provider’s logs if it does not show up.`
  });
});

export const listAdminEmailLogs = asyncHandler(async (req: Request, res: Response) => {
  const q = adminEmailLogsQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const [rows, total] = await Promise.all([
    EmailLog.find().sort({ createdAt: -1 }).skip(skip).limit(q.limit).lean(),
    EmailLog.countDocuments()
  ]);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    logs: rows.map((r) => ({
      id: (r as { _id: mongoose.Types.ObjectId })._id.toString(),
      to: r.to,
      subject: r.subject,
      category: r.category,
      status: r.status,
      errorMessage: r.errorMessage || "",
      createdAt: (r as { createdAt: Date }).createdAt
    })),
    total,
    page: q.page,
    limit: q.limit
  });
});

export const listAdminReports = asyncHandler(async (req: Request, res: Response) => {
  const q = adminReportsQuerySchema.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.status && q.status !== "all") {
    filter.status = q.status;
  }
  if (q.priority && q.priority !== "all") {
    filter.priority = q.priority;
  }
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ description: re }, { adminNote: re }, { targetId: re }];
  }
  const skip = (q.page - 1) * q.limit;
  const [rows, total, statusCounts] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit).lean(),
    Report.countDocuments(filter),
    Report.aggregate<{ _id: string; n: number }>([
      { $group: { _id: "$status", n: { $sum: 1 } } }
    ])
  ]);

  /** Pre-fetch reporter, target users, target orders, target products. */
  const userIds = new Set<string>();
  for (const r of rows) {
    if (r.reporterId) userIds.add(r.reporterId.toString());
    if (r.resolvedById) userIds.add(r.resolvedById.toString());
    if (r.targetType === "user" && r.targetId && mongoose.isValidObjectId(r.targetId)) {
      userIds.add(r.targetId);
    }
  }
  const orderIds = rows
    .filter((r) => r.targetType === "order" && r.targetId && mongoose.isValidObjectId(r.targetId))
    .map((r) => r.targetId as string);
  const productIds = rows
    .filter((r) => r.targetType === "product" && r.targetId && mongoose.isValidObjectId(r.targetId))
    .map((r) => r.targetId as string);

  const [users, orders, products] = await Promise.all([
    User.find({ _id: { $in: Array.from(userIds).map((x) => new mongoose.Types.ObjectId(x)) } })
      .select("email displayName role profileImageUrl businessName")
      .lean(),
    orderIds.length
      ? Order.find({ _id: { $in: orderIds.map((x) => new mongoose.Types.ObjectId(x)) } })
          .select("items total currency createdAt buyerId")
          .lean()
      : Promise.resolve([] as Awaited<ReturnType<typeof Order.find>>),
    productIds.length
      ? Product.find({ _id: { $in: productIds.map((x) => new mongoose.Types.ObjectId(x)) } })
          .select("name imageUrls images sellerId price")
          .lean()
      : Promise.resolve([] as Awaited<ReturnType<typeof Product.find>>)
  ]);

  type UserSummary = {
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl: string;
    businessName: string;
  };
  const toUserSummary = (u: {
    _id: mongoose.Types.ObjectId;
    email?: string;
    displayName?: string;
    role?: string;
    profileImageUrl?: string;
    businessName?: string;
  }): UserSummary => ({
    id: u._id.toString(),
    name: (u.displayName || "").trim() || u.email || "—",
    email: (u.email || "").trim(),
    role: (u.role || "buyer") as string,
    avatarUrl: rewriteStoredMediaUrl((u.profileImageUrl || "").trim()),
    businessName: (u.businessName || "").trim()
  });
  const umap = new Map<string, UserSummary>();
  for (const u of users) {
    umap.set((u as { _id: mongoose.Types.ObjectId })._id.toString(), toUserSummary(u as Parameters<typeof toUserSummary>[0]));
  }
  const omap = new Map<string, (typeof orders)[number]>();
  for (const o of orders) omap.set((o as { _id: mongoose.Types.ObjectId })._id.toString(), o);
  const pmap = new Map<string, (typeof products)[number]>();
  for (const p of products) pmap.set((p as { _id: mongoose.Types.ObjectId })._id.toString(), p);

  /** From any product doc, return a single absolute-or-relative URL to use as a thumbnail. */
  const productThumb = (p: { imageUrls?: string[]; images?: Array<string | { url?: string }> }) => {
    let raw = "";
    if (Array.isArray(p.imageUrls) && p.imageUrls.length) raw = p.imageUrls[0];
    else {
      const first = Array.isArray(p.images) && p.images.length ? p.images[0] : null;
      if (!first) return "";
      raw = typeof first === "object" ? first.url || "" : String(first);
    }
    return rewriteStoredMediaUrl(raw);
  };

  const counts = {
    all: 0,
    open: 0,
    in_review: 0,
    resolved: 0,
    dismissed: 0
  } as Record<string, number>;
  for (const c of statusCounts) {
    counts[c._id] = c.n;
    counts.all += c.n;
  }

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    reports: rows.map((r) => {
      const reporter = umap.get(r.reporterId.toString()) || null;
      const targetUser =
        r.targetType === "user" && r.targetId && umap.get(r.targetId) ? umap.get(r.targetId) : null;
      let order: {
        id: string;
        total: number;
        currency: string;
        createdAt: Date;
        productNames: string;
        firstThumb: string;
        buyerId: string;
      } | null = null;
      let orderBuyer: UserSummary | null = null;
      if (r.targetType === "order" && r.targetId && omap.has(r.targetId)) {
        const o = omap.get(r.targetId)!;
        const items = (o as { items?: Array<{ name?: string; image?: string; imageUrl?: string }> }).items || [];
        order = {
          id: (o as { _id: mongoose.Types.ObjectId })._id.toString(),
          total: (o as { total?: number }).total || 0,
          currency: (o as { currency?: string }).currency || "GHS",
          createdAt: (o as { createdAt: Date }).createdAt,
          productNames: items.map((it) => it.name || "").filter(Boolean).join(", "),
          firstThumb: rewriteStoredMediaUrl(items[0]?.image || items[0]?.imageUrl || ""),
          buyerId: ((o as { buyerId?: mongoose.Types.ObjectId }).buyerId || "").toString()
        };
        if (order.buyerId && umap.has(order.buyerId)) orderBuyer = umap.get(order.buyerId)!;
      }
      let product: { id: string; name: string; thumb: string; sellerId: string; price: number } | null = null;
      let productSeller: UserSummary | null = null;
      if (r.targetType === "product" && r.targetId && pmap.has(r.targetId)) {
        const p = pmap.get(r.targetId)!;
        const sellerId = ((p as { sellerId?: mongoose.Types.ObjectId }).sellerId || "").toString();
        product = {
          id: (p as { _id: mongoose.Types.ObjectId })._id.toString(),
          name: (p as { name?: string }).name || "",
          thumb: productThumb(p as Parameters<typeof productThumb>[0]),
          sellerId,
          price: (p as { price?: number }).price || 0
        };
        if (sellerId && umap.has(sellerId)) productSeller = umap.get(sellerId)!;
      }
      return {
        id: r._id.toString(),
        reporterId: r.reporterId.toString(),
        reporterLabel: reporter?.name || "—",
        reporter,
        targetUser,
        order,
        orderBuyer,
        product,
        productSeller,
        category: r.category,
        description: r.description,
        targetType: r.targetType,
        targetId: r.targetId,
        status: r.status,
        priority: r.priority || "medium",
        adminNote: r.adminNote,
        evidenceUrls: Array.isArray((r as { evidenceUrls?: string[] }).evidenceUrls)
          ? (r as { evidenceUrls: string[] }).evidenceUrls
          : [],
        createdAt: r.createdAt,
        updatedAt: (r as { updatedAt?: Date }).updatedAt || null,
        resolvedAt: r.resolvedAt,
        resolvedById: r.resolvedById?.toString(),
        resolvedByLabel: r.resolvedById ? umap.get(r.resolvedById.toString())?.name || null : null
      };
    }),
    total,
    counts,
    page: q.page,
    limit: q.limit
  });
});

export const patchAdminReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid report id");
  const body = adminReportPatchSchema.parse(req.body);
  const r = await Report.findById(id);
  if (!r) throw new HttpError(404, "Report not found");
  if (body.status !== undefined) r.status = body.status;
  if (body.priority !== undefined) r.priority = body.priority;
  if (body.adminNote !== undefined) r.adminNote = body.adminNote;
  if (r.status === "resolved" || r.status === "dismissed") {
    r.resolvedAt = new Date();
    const adminId = req.user?.id;
    if (adminId && mongoose.isValidObjectId(adminId)) {
      r.resolvedById = new mongoose.Types.ObjectId(adminId);
    } else {
      r.set("resolvedById", null);
    }
  } else {
    r.resolvedAt = undefined;
    r.set("resolvedById", null);
  }
  await r.save();
  const bits: string[] = [];
  if (body.status !== undefined) bits.push(`status → ${body.status}`);
  if (body.priority !== undefined) bits.push(`priority → ${body.priority}`);
  if (body.adminNote !== undefined) bits.push("admin note updated");
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "report.patch",
    title: `Report ${id.slice(-8)} updated`,
    detail: bits.join(" · ")
  });
  res.json({
    ok: true,
    report: { id: r._id.toString(), status: r.status, priority: r.priority, adminNote: r.adminNote }
  });
});

export const getAdminRevenue = asyncHandler(async (req: Request, res: Response) => {
  const daysRaw = typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 30;
  const days = Math.min(365, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30));
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const orders = await Order.find({ createdAt: { $gte: start }, status: { $ne: "cancelled" } })
    .select(
      "items createdAt total status refundStatus paymentMethod paystackRefundId paystackRefundRemoteStatus"
    )
    .lean();
  const byDay = new Map<string, { platform: number; gross: number; count: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const k = d.toISOString().slice(0, 10);
    byDay.set(k, { platform: 0, gross: 0, count: 0 });
  }
  for (const o of orders) {
    const k = o.createdAt ? new Date(o.createdAt as Date).toISOString().slice(0, 10) : "";
    if (!byDay.has(k)) continue;
    if (isOrderExcludedFromRevenueMetrics(o)) continue;
    const bucket = byDay.get(k)!;
    bucket.count += 1;
    for (const it of o.items) {
      const g = roundMoney((it as { unitPrice: number; quantity: number }).unitPrice * (it as { quantity: number }).quantity);
      bucket.gross = roundMoney(bucket.gross + g);
      if (typeof (it as { platformFee?: number }).platformFee === "number") {
        bucket.platform = roundMoney(bucket.platform + (it as { platformFee: number }).platformFee);
      } else {
        bucket.platform = roundMoney(bucket.platform + splitLineGross(g).platformFee);
      }
    }
  }
  const series = [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  let totalPlatform = 0;
  let totalGross = 0;
  for (const s of series) {
    totalPlatform = roundMoney(totalPlatform + s.platform);
    totalGross = roundMoney(totalGross + s.gross);
  }
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ days, series, totals: { platformFee: totalPlatform, gross: totalGross, commissionPercent: await getEffectiveCommissionPercent() } });
});

export const getAdminSellerBalances = asyncHandler(async (_req: Request, res: Response) => {
  const orders = await Order.find({ status: { $in: [...PAID_LIKE] } })
    .select("items")
    .lean();
  const bySeller = new Map<string, { proceeds: number; lineCount: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const sid = (it as { sellerId: mongoose.Types.ObjectId }).sellerId.toString();
      const row = bySeller.get(sid) || { proceeds: 0, lineCount: 0 };
      const sp = (it as { sellerProceeds?: number }).sellerProceeds;
      if (typeof sp === "number") {
        row.proceeds = roundMoney(row.proceeds + sp);
      } else {
        const g = roundMoney((it as { unitPrice: number; quantity: number }).unitPrice * (it as { quantity: number }).quantity);
        row.proceeds = roundMoney(row.proceeds + splitLineGross(g).sellerProceeds);
      }
      row.lineCount += 1;
      bySeller.set(sid, row);
    }
  }
  const ids = [...bySeller.keys()].map((x) => new mongoose.Types.ObjectId(x));
  const users = await User.find({ _id: { $in: ids } })
    .select("displayName email role")
    .lean();
  const umap = new Map(users.map((u) => [u._id.toString(), u]));
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    sellers: [...bySeller.entries()]
      .map(([id, v]) => {
        const u = umap.get(id) as { displayName?: string; email?: string; role?: string } | undefined;
        return {
          id,
          displayName: (u?.displayName || "").trim() || (u?.email || "").split("@")[0] || "—",
          email: u?.email ?? "",
          role: u?.role ?? "seller",
          sellerProceedsTotal: v.proceeds,
          lineCount: v.lineCount
        };
      })
      .sort((a, b) => b.sellerProceedsTotal - a.sellerProceedsTotal)
  });
});

export const getAdminConversation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid conversation id");
  const c = await Conversation.findById(id).lean();
  if (!c) throw new HttpError(404, "Thread not found");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ thread: await formatAdminThreadResponse(c) });
});

async function formatAdminThreadResponse(c: {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  kind?: string;
  messages?: Array<{ senderId: mongoose.Types.ObjectId; senderRole: string; text: string; createdAt: Date }>;
}) {
  const kind = (c.kind || "order") as string;
  const msgs = (c.messages || []) as Array<{
    senderId: mongoose.Types.ObjectId;
    senderRole: string;
    text: string;
    createdAt: Date;
  }>;
  const peerIds = [c.buyerId.toString(), c.sellerId.toString()];
  const adminSenderIds = [...new Set(msgs.filter((m) => m.senderRole === "admin").map((m) => m.senderId.toString()))];
  const allIdStrs = [...new Set([...peerIds, ...adminSenderIds])];
  const users = await User.find({ _id: { $in: allIdStrs.map((s) => new mongoose.Types.ObjectId(s)) } })
    .select("email displayName")
    .lean();
  const umap = new Map(
    users.map((u) => [
      u._id.toString(),
      { email: (u as { email?: string }).email ?? "", name: (u as { displayName?: string }).displayName ?? "" }
    ])
  );
  const labelFor = (id: string) => (umap.get(id)?.name || "").trim() || umap.get(id)?.email || "—";
  const buyerLabel = labelFor(c.buyerId.toString());
  const sellerLabel = labelFor(c.sellerId.toString());
  const messages = sortMsgs(msgs).map((m) => ({
    senderId: m.senderId.toString(),
    senderRole: m.senderRole,
    text: m.text,
    createdAt: m.createdAt,
    senderLabel:
      m.senderRole === "buyer"
        ? buyerLabel
        : m.senderRole === "seller"
          ? sellerLabel
          : (umap.get(m.senderId.toString())?.name || "").trim() || umap.get(m.senderId.toString())?.email || "Admin"
  }));
  return {
    id: c._id.toString(),
    kind,
    buyerId: c.buyerId.toString(),
    sellerId: c.sellerId.toString(),
    buyerLabel,
    sellerLabel,
    messages
  };
}

function sortMsgs<T extends { createdAt: Date }>(msgs: T[]): T[] {
  return [...msgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export const listAdminConversations = asyncHandler(async (req: Request, res: Response) => {
  const q = adminListQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const [rows, total] = await Promise.all([
    Conversation.find()
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(q.limit)
      .lean(),
    Conversation.countDocuments()
  ]);
  const uids = new Set<string>();
  for (const c of rows) {
    uids.add(c.buyerId.toString());
    uids.add(c.sellerId.toString());
  }
  const users = await User.find({ _id: { $in: [...uids].map((x) => new mongoose.Types.ObjectId(x)) } })
    .select("email displayName")
    .lean();
  const umap = new Map(users.map((u) => [u._id.toString(), { email: (u as { email?: string }).email ?? "", name: (u as { displayName?: string }).displayName ?? "" }]));
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    threads: rows.map((c) => {
      const msgs = (c.messages || []) as Array<{ text: string; createdAt: Date; senderRole: string }>;
      const last = msgs.length ? msgs.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b)) : null;
      return {
        id: c._id.toString(),
        kind: (c as { kind?: string }).kind || "order",
        buyerId: c.buyerId.toString(),
        sellerId: c.sellerId.toString(),
        buyerLabel: (umap.get(c.buyerId.toString())?.name || "").trim() || umap.get(c.buyerId.toString())?.email || "—",
        sellerLabel: (umap.get(c.sellerId.toString())?.name || "").trim() || umap.get(c.sellerId.toString())?.email || "—",
        messageCount: msgs.length,
        lastMessage: last
          ? { text: last.text, createdAt: last.createdAt, senderRole: last.senderRole }
          : null,
        updatedAt: c.updatedAt
      };
    }),
    total,
    page: q.page,
    limit: q.limit
  });
});

export const getAdminConversationWithUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(400, "Invalid user id");
  const supportId = await getPrimarySupportAdminId();
  if (!supportId) throw new HttpError(503, "No administrator account is configured for support threads.");
  const customerOid = new mongoose.Types.ObjectId(userId);
  if (customerOid.equals(supportId)) throw new HttpError(400, "Invalid user");
  const c = await Conversation.findOne({ buyerId: customerOid, sellerId: supportId, kind: "support" }).lean();
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (!c) {
    res.json({ thread: null });
    return;
  }
  res.json({ thread: await formatAdminThreadResponse(c) });
});

export const postAdminMessageToUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { text } = conversationMessageSchema.parse(req.body);
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(400, "Invalid user id");
  const customerOid = new mongoose.Types.ObjectId(userId);
  const supportId = await getPrimarySupportAdminId();
  if (!supportId) throw new HttpError(503, "No administrator account is configured for support threads.");
  if (customerOid.equals(supportId)) throw new HttpError(400, "Invalid recipient");

  let conv = await Conversation.findOne({ buyerId: customerOid, sellerId: supportId, kind: "support" });
  if (!conv) {
    conv = await Conversation.create({ buyerId: customerOid, sellerId: supportId, kind: "support", messages: [] });
  }
  conv.messages.push({
    senderId: new mongoose.Types.ObjectId(req.user!.id),
    senderRole: "admin",
    text,
    createdAt: new Date()
  });
  await conv.save();

  const fresh = await Conversation.findById(conv._id).lean();
  if (!fresh) throw new HttpError(500, "Could not reload thread");

  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "conversation.support_reply",
    title: `Support message → user …${userId.slice(-6)}`,
    detail: text.slice(0, 200)
  });

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ ok: true, thread: await formatAdminThreadResponse(fresh) });
});

export const getAdminUserSummary = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid user id");
  const u = await User.findById(id).lean();
  if (!u) throw new HttpError(404, "User not found");
  const oid = new mongoose.Types.ObjectId(id);
  const [orderCount, sellOrderLines, productCount, reportsAgainst] = await Promise.all([
    Order.countDocuments({ buyerId: oid }),
    Order.countDocuments({ "items.sellerId": oid }),
    Product.countDocuments({ sellerId: oid }),
    Report.countDocuments({ targetType: "user", targetId: id })
  ]);
  const recentOrders = await Order.find({ $or: [{ buyerId: oid }, { "items.sellerId": oid }] })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("status total createdAt")
    .lean();
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const uRole = (u as { role: string }).role;
  const uEmail = (u as { email?: string }).email;
  const aLevel = adminLevelForList(uEmail, uRole);
  res.json({
    user: {
      id: u._id.toString(),
      email: uEmail ?? "",
      phone: publicPhoneForPaymentRole(
        normalizeUserRole((u as { role: string }).role),
        (u as { phone?: string }).phone
      ),
      displayName: (u as { displayName?: string }).displayName ?? "",
      role: uRole,
      ...(aLevel ? { adminLevel: aLevel } : {}),
      accountStatus: (u as { accountStatus?: string }).accountStatus ?? "active",
      createdAt: u.createdAt
    },
    activity: {
      ordersAsBuyer: orderCount,
      ordersTouchingSeller: sellOrderLines,
      listings: productCount,
      reportsMentioningUser: reportsAgainst
    },
    recentOrders: recentOrders.map((o) => ({
      id: o._id.toString(),
      status: o.status,
      total: o.total,
      createdAt: o.createdAt
    }))
  });
});

async function syncPaystackRefundOnOrder(o: HydratedDocument<OrderDoc>): Promise<void> {
  if (o.paystackRefundId == null) return;
  const { status } = await getPaystackRefundById(o.paystackRefundId);
  o.paystackRefundRemoteStatus = status;
  if (isPaystackRefundRemoteSettled(status)) {
    await applyProcessedPaystackRefundToOrder(o);
    return;
  }
  if (status === "failed") {
    o.refundStatus = "requested";
    o.paystackRefundId = null;
    o.paystackRefundRemoteStatus = "";
    return;
  }
  o.refundStatus = "refund_processing";
}

/**
 * Create or refresh a Paystack refund for an order. Sets `refunded` only when Paystack reports `processed`.
 */
export const refundAdminOrderPaystack = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  if (!env.PAYSTACK_SECRET_KEY?.trim()) throw new HttpError(503, "Paystack not configured");

  const o = await Order.findById(id);
  if (!o) throw new HttpError(404, "Order not found");

  if (o.paymentMethod !== "paystack") {
    throw new HttpError(
      400,
      "This action only applies to Paystack (card / mobile money) payments. For other methods, refund the buyer outside the app."
    );
  }
  if (!PAID_LIKE.includes(o.status as (typeof PAID_LIKE)[number])) {
    throw new HttpError(400, "Only paid or in‑fulfillment orders can be refunded online.");
  }
  if (o.refundStatus === "refunded") {
    if (
      o.paymentMethod === "paystack" &&
      (!isPaystackRefundRemoteSettled(o.paystackRefundRemoteStatus || "") || o.paystackRefundId == null)
    ) {
      if (o.paystackRefundId != null) {
        await syncPaystackRefundOnOrder(o);
      } else {
        o.refundStatus = "requested";
        o.paystackRefundRemoteStatus = "";
      }
      await o.save();
      const [fixed] = await withContacts([o.toObject() as unknown as Record<string, unknown>]);
      return res.json({
        order: fixed,
        refundMessage:
          "This order was stored as refunded before Paystack confirmed funds — status was corrected. Use Refund buyer again to start or refresh the Paystack refund."
      });
    }
    const [already] = await withContacts([o.toObject() as unknown as Record<string, unknown>]);
    return res.json({
      order: already,
      refundMessage: "Already fully refunded (Paystack reports processed)."
    });
  }

  const ref = (o.paystackReference || o.paymentReference || "").trim();
  if (!ref) throw new HttpError(400, "No Paystack transaction reference on this order.");

  if (o.paystackRefundId != null) {
    await syncPaystackRefundOnOrder(o);
  } else {
    const created = await createPaystackRefund(ref, {
      currency: (o.currency || "GHS").toString().toUpperCase()
    });
    o.paystackRefundId = created.id;
    o.paystackRefundRemoteStatus = created.status;
    if (o.paystackTransactionId == null) o.paystackTransactionId = created.paystackTransactionId;
    if (isPaystackRefundRemoteSettled(created.status)) {
      await applyProcessedPaystackRefundToOrder(o);
    } else {
      o.refundStatus = "refund_processing";
    }
  }

  await o.save();

  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "order.refund_paystack",
    title: `Paystack refund · order …${id.slice(-6)}`,
    detail: `status ${o.refundStatus} · remote ${o.paystackRefundRemoteStatus || "—"} · id ${o.paystackRefundId ?? "—"}`
  });

  const [out] = await withContacts([o.toObject() as unknown as Record<string, unknown>]);
  res.json({ order: out });
});

export const resetAdminUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid user id");
  const { newPassword } = adminResetPasswordSchema.parse(req.body);
  const u = await User.findById(id).select("+passwordHash");
  if (!u) throw new HttpError(404, "User not found");
  u.passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT);
  await u.save();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "user.password_reset",
    title: "Password reset by admin",
    detail: ((u as { email?: string }).email || "").trim().slice(0, 120) || id
  });
  res.json({ ok: true });
});

/**
 * When Paystack webhooks fail or the buyer paid off‑platform (MoMo/bank), admins can mark the order
 * paid here. Matches vendor `confirmVendorPaymentReceived` when all sellers confirm: sets `paid`,
 * fills `confirmedSellerIds`, and decrements product stock once.
 */
export const markAdminOrderPaid = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  const o = await Order.findById(id);
  if (!o) throw new HttpError(404, "Order not found");

  if (!["pending_payment", "awaiting_vendor_payment"].includes(o.status)) {
    throw new HttpError(
      400,
      o.status === "paid"
        ? "This order is already marked as paid."
        : "Only orders that are still waiting for payment can be marked paid this way."
    );
  }

  const prevStatus = o.status;
  const uniqueSellerIds = [...new Set(o.items.map((it) => it.sellerId.toString()))];
  o.confirmedSellerIds = uniqueSellerIds.map((s) => new mongoose.Types.ObjectId(s));
  o.status = "paid";

  for (const it of o.items) {
    await Product.updateOne({ _id: it.productId }, { $inc: { stock: -it.quantity } });
  }

  await o.save();

  await mirrorOrderStatusToDelivery(o);

  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "order.mark_paid",
    title: `Payment marked received (admin) — …${id.slice(-8)}`,
    detail: `${prevStatus} → paid · stock adjusted for ${o.items.length} line(s)`
  });

  const [out] = await withContacts([o.toObject() as unknown as Record<string, unknown>]);
  res.json({ order: out });
});

export const patchAdminOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  const body = adminOrderPatchSchema.parse(req.body);
  const o = await Order.findById(id);
  if (!o) throw new HttpError(404, "Order not found");
  if (body.status !== undefined) o.status = body.status;
  if (body.disputeOpen !== undefined) (o as { disputeOpen: boolean }).disputeOpen = body.disputeOpen;
  if (body.adminNote !== undefined) (o as { adminNote: string }).adminNote = body.adminNote;
  if (body.refundStatus !== undefined) {
    if (body.refundStatus !== "none" && body.refundStatus !== "requested") {
      throw new HttpError(
        400,
        "Only “none” or “requested” can be set here. Use Refund via Paystack to return money for online payments."
      );
    }
    if (o.refundStatus === "refunded") {
      throw new HttpError(400, "This order is already fully refunded; do not change the tracking flags here.");
    }
    if (o.refundStatus === "refund_processing" && body.refundStatus === "none") {
      throw new HttpError(
        400,
        "A Paystack refund is still in progress. Wait for Paystack to finish or fail before clearing the request."
      );
    }
    (o as { refundStatus: string }).refundStatus = body.refundStatus;
  }
  await o.save();
  if (body.status !== undefined) {
    await mirrorOrderStatusToDelivery(o as HydratedDocument<OrderDoc>);
  }
  const bits: string[] = [];
  if (body.status !== undefined) bits.push(`status → ${body.status}`);
  if (body.disputeOpen !== undefined) bits.push(`dispute → ${body.disputeOpen}`);
  if (body.refundStatus !== undefined) bits.push(`refund → ${body.refundStatus}`);
  if (body.adminNote !== undefined) bits.push("note updated");
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "order.patch",
    title: `Order ${id.slice(-8)} updated`,
    detail: bits.join(" · ")
  });
  const [out] = await withContacts([o.toObject() as unknown as Record<string, unknown>]);
  res.json({ order: out });
});

export const patchAdminProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const body = adminProductPatchSchema.parse(req.body);
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  if (body.name !== undefined) p.name = body.name;
  if (body.price !== undefined) p.price = body.price;
  if (body.stock !== undefined) p.stock = body.stock;
  if (body.description !== undefined) p.description = body.description;
  if (body.category !== undefined) (p as { category: string }).category = body.category;
  if (body.status !== undefined) p.status = body.status;
  if (body.flagged !== undefined) (p as { flagged: boolean }).flagged = body.flagged;
  await p.save();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "product.patch",
    title: `Listing edited (admin) — ${p.name.slice(0, 80)}`,
    detail: id
  });
  res.json({ ok: true, product: { id: p._id.toString(), name: p.name, status: p.status, flagged: (p as { flagged?: boolean }).flagged } });
});

export const deleteAdminProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  const name = p.name;
  await Review.deleteMany({ productId: p._id });
  await p.deleteOne();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "delete.product",
    title: `Listing deleted — ${name.slice(0, 80)}`,
    detail: id
  });
  res.status(204).send();
});

/**
 * Hard-delete a report. Use to clean up resolved/dismissed cases the team no longer needs.
 * No status restriction — admins should be trusted to scrub stale reports — but the modal
 * confirms before sending the request.
 */
export const deleteAdminReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid report id");
  const r = await Report.findById(id);
  if (!r) throw new HttpError(404, "Report not found");
  await r.deleteOne();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "delete.report",
    title: "Report deleted",
    detail: id
  });
  res.status(204).send();
});

/**
 * Hard-delete an order. Restricted to `cancelled` orders so paid/processing/delivered records
 * remain intact for audit, refunds, and seller payouts. Admin uses this to clear abandoned carts.
 */
export const deleteAdminOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid order id");
  const o = await Order.findById(id);
  if (!o) throw new HttpError(404, "Order not found");
  if (o.status !== "cancelled") {
    throw new HttpError(
      400,
      "Only cancelled orders can be deleted. Cancel the order first or keep it for audit."
    );
  }
  await o.deleteOne();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "delete.order",
    title: "Cancelled order deleted",
    detail: id
  });
  res.status(204).send();
});

/**
 * Hard-delete a vendor application. Restricted to `approved` or `rejected` records so we never
 * silently drop a pending application without a decision.
 */
export const deleteAdminVendorApplication = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid application id");
  const app = await VendorApplication.findById(id);
  if (!app) throw new HttpError(404, "Application not found");
  if (app.status === "pending") {
    throw new HttpError(
      400,
      "Approve or reject this application first — pending records cannot be deleted."
    );
  }
  const shopName = app.shopName;
  await app.deleteOne();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "delete.vendorApplication",
    title: `Vendor application removed — ${shopName.slice(0, 60)}`,
    detail: id
  });
  res.status(204).send();
});

/**
 * Hard-delete a user and cascade their owned data:
 *   - Tokens, vendor apps, vendor analytics events
 *   - Their products and the reviews on those products (if seller)
 * Refuses for admins, and for any user with active orders (buyer or seller side) — those must
 * be resolved first to avoid orphaning live commerce.
 */
export const deleteAdminUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid user id");
  const u = await User.findById(id);
  if (!u) throw new HttpError(404, "User not found");
  const deletedEmail = ((u as { email?: string }).email || "").trim();
  const deletedRole = normalizeUserRole(u.role);
  if (normalizeUserRole(u.role) === "admin") {
    throw new HttpError(403, "Admin accounts cannot be deleted from this panel.");
  }
  if (req.user?.id === id) {
    throw new HttpError(400, "Use Account → Delete to remove your own account.");
  }

  const ACTIVE = ["pending_payment", "awaiting_vendor_payment", "paid", "processing", "delivered"] as const;
  const uidObj = u._id;

  if (normalizeUserRole(u.role) === "buyer") {
    const active = await Order.countDocuments({ buyerId: uidObj, status: { $in: [...ACTIVE] } });
    if (active > 0) {
      throw new HttpError(
        409,
        `User has ${active} active order${active === 1 ? "" : "s"}. Cancel or complete them first.`
      );
    }
  } else if (normalizeUserRole(u.role) === "seller") {
    const active = await Order.countDocuments({ "items.sellerId": uidObj, status: { $in: [...ACTIVE] } });
    if (active > 0) {
      throw new HttpError(
        409,
        `Seller has ${active} active sales order${active === 1 ? "" : "s"}. Cancel or complete them first.`
      );
    }
    const sellerProductIds = await Product.find({ sellerId: uidObj }).distinct("_id");
    if (sellerProductIds.length > 0) {
      await Review.deleteMany({ productId: { $in: sellerProductIds } });
    }
    await VendorAnalyticsEvent.deleteMany({ sellerId: uidObj });
    await Product.deleteMany({ sellerId: uidObj });
  } else if (normalizeUserRole(u.role) === "rider") {
    const activeAssignments = await Delivery.countDocuments({
      assignedRiderId: uidObj,
      currentStage: { $nin: ["delivered", "cancelled"] }
    });
    if (activeAssignments > 0) {
      throw new HttpError(
        409,
        `Courier has ${activeAssignments} active delivery assignment${activeAssignments === 1 ? "" : "s"}. Resolve them before deleting this account.`
      );
    }
    await RiderProfile.deleteMany({ userId: uidObj });
  }

  await CourierApplication.deleteMany({ userId: uidObj });
  await VendorApplication.deleteMany({ userId: uidObj });
  await Token.deleteMany({ userId: uidObj });
  await u.deleteOne();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "delete.user",
    title: `User deleted — ${deletedEmail || id}`,
    detail: deletedRole
  });
  res.status(204).send();
});

/**
 * Bulk cleanup: delete all cancelled orders older than `?days=N` (default 30) and all
 * resolved/dismissed reports older than the same window. Returns a count of removed rows so
 * the admin gets feedback on how much DB pressure was relieved.
 */
export const adminBulkCleanup = asyncHandler(async (req: Request, res: Response) => {
  const daysRaw = typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 30;
  const days = Number.isFinite(daysRaw) && daysRaw >= 1 ? daysRaw : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [orders, reports, apps, courierApps] = await Promise.all([
    Order.deleteMany({ status: "cancelled", updatedAt: { $lt: cutoff } }),
    Report.deleteMany({ status: { $in: ["resolved", "dismissed"] }, updatedAt: { $lt: cutoff } }),
    VendorApplication.deleteMany({ status: { $in: ["approved", "rejected"] }, updatedAt: { $lt: cutoff } }),
    CourierApplication.deleteMany({ status: { $in: ["approved", "rejected"] }, updatedAt: { $lt: cutoff } })
  ]);

  const payload = {
    ok: true,
    days,
    cutoff: cutoff.toISOString(),
    deleted: {
      cancelledOrders: orders.deletedCount || 0,
      closedReports: reports.deletedCount || 0,
      reviewedVendorApps: apps.deletedCount || 0,
      reviewedCourierApps: courierApps.deletedCount || 0
    }
  };
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "system.cleanup",
    title: `Bulk cleanup (${days}d)`,
    detail: `orders ${payload.deleted.cancelledOrders} · reports ${payload.deleted.closedReports} · apps ${payload.deleted.reviewedVendorApps} · courier apps ${payload.deleted.reviewedCourierApps}`
  });
  res.json(payload);
});

export const listVendorApplications = asyncHandler(async (req: Request, res: Response) => {
  const q = adminVendorApplicationsQuerySchema.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.status !== "all") filter.status = q.status;
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [
      { shopName: re },
      { fullName: re },
      { email: re },
      { nearbyArea: re },
      { sellsDescription: re }
    ];
  }
  const skip = (q.page - 1) * q.limit;
  const [rows, total] = await Promise.all([
    VendorApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit).lean(),
    VendorApplication.countDocuments(filter)
  ]);
  const knownUserIds = rows
    .map((r) => (r.userId != null ? String((r.userId as mongoose.Types.ObjectId).toString()) : null))
    .filter((id): id is string => Boolean(id));
  const userIds = [...new Set(knownUserIds)];
  const users =
    userIds.length > 0
      ? await User.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
          .select("displayName email")
          .lean()
      : [];
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  res.json({
    applications: rows.map((r) => {
      const uid = r.userId != null ? String((r.userId as mongoose.Types.ObjectId).toString()) : null;
      return {
      id: r._id.toString(),
      userId: uid,
      isGuestSubmission: !uid,
      fullName: r.fullName,
      email: r.email,
      shopName: r.shopName,
      category: r.category,
      sellsDescription: r.sellsDescription,
      phone: r.phone,
      altPhone: r.altPhone,
      shopDescription: r.shopDescription,
      verificationDocUrl: r.verificationDocUrl,
      locationBase: r.locationBase,
      nearbyArea: r.nearbyArea,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      accountDisplayName: uid ? byId.get(uid)?.displayName || "" : "(guest — activates via email link)"
    };
    }),
    total,
    page: q.page,
    limit: q.limit
  });
});

export const patchAdminVendorApplication = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid application id");
  const body = patchVendorApplicationSchema.parse(req.body);
  const app = await VendorApplication.findById(id);
  if (!app) throw new HttpError(404, "Application not found");
  if (app.status !== "pending") throw new HttpError(400, "Only pending applications can be reviewed.");

  const appEmailNorm = (app.email || "").trim().toLowerCase();

  if (body.action === "reject") {
    app.status = "rejected";
    app.adminNote = body.adminNote;
    app.reviewedAt = new Date();
    await app.save();
    if (app.userId) {
      await User.updateOne({ _id: app.userId }, { $set: { vendorStatus: "rejected" } });
    }
    await recordAdminAuditEvent({
      actorId: req.user?.id,
      action: "application.reject",
      title: `Vendor rejected — ${app.shopName.slice(0, 60)}`,
      detail: (body.adminNote || "").slice(0, 500)
    });
    res.json({ ok: true, status: "rejected" });
    return;
  }

  if (appEmailNorm) {
    const existing = await User.findOne({ email: appEmailNorm }).select("role");
    if (existing) {
      const role = normalizeUserRole(existing.role);
      if (role === "admin") {
        throw new HttpError(400, "Admin accounts cannot be approved as vendors.");
      }
      if (role === "rider") {
        throw new HttpError(400, "Rider accounts cannot be approved as vendors.");
      }
      if (role === "seller") {
        throw new HttpError(400, "This email already belongs to a vendor account.");
      }
    }
  }

  const activationToken = createOpaqueToken();
  const activationExpiry = new Date(Date.now() + VENDOR_ACTIVATION_TTL_MS);

  app.status = "approved";
  app.adminNote = body.adminNote || "";
  app.reviewedAt = new Date();
  app.activationTokenHash = sha256(activationToken);
  app.activationExpiry = activationExpiry;
  await app.save();

  const appOrigin = env.APP_ORIGIN.replace(/\/$/, "");
  const activationUrl = `${appOrigin}/activate-account?token=${encodeURIComponent(activationToken)}&type=vendor`;

  await sendEmail(
    app.email,
    "Your SHOPIQGH vendor application has been approved!",
    buildVendorActivationEmailHtml({
      fullName: app.fullName,
      shopName: app.shopName,
      activationUrl
    }),
    { category: "vendor_approval" }
  );

  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "application.approve",
    title: `Vendor approved — ${app.shopName.slice(0, 60)}`,
    detail: `${app.email} · activation email sent`
  });
  res.json({ ok: true, status: "approved", activationEmailSent: true });
});

export const listCourierApplications = asyncHandler(async (req: Request, res: Response) => {
  const q = adminCourierApplicationsQuerySchema.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.status !== "all") filter.status = q.status;
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ fullName: re }, { email: re }, { phone: re }, { vehicleType: re }, { notes: re }];
  }
  const skip = (q.page - 1) * q.limit;
  const [rows, total] = await Promise.all([
    CourierApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit).lean(),
    CourierApplication.countDocuments(filter)
  ]);
  const knownUserIds = rows
    .map((r) => (r.userId != null ? String((r.userId as mongoose.Types.ObjectId).toString()) : null))
    .filter((id): id is string => Boolean(id));
  const userIds = [...new Set(knownUserIds)];
  const users =
    userIds.length > 0
      ? await User.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
          .select("displayName email")
          .lean()
      : [];
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  res.json({
    applications: rows.map((r) => {
      const uid = r.userId != null ? String((r.userId as mongoose.Types.ObjectId).toString()) : null;
      return {
        id: r._id.toString(),
        userId: uid,
        isGuestSubmission: !uid,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        vehicleType: r.vehicleType,
        notes: r.notes,
        idDocUrl: r.idDocUrl,
        status: r.status,
        adminNote: r.adminNote,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
        accountDisplayName: uid ? byId.get(uid)?.displayName || "" : "(guest — activates via email link)"
      };
    }),
    total,
    page: q.page,
    limit: q.limit
  });
});

export const patchAdminCourierApplication = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid application id");
  const body = patchCourierApplicationSchema.parse(req.body);
  const ca = await CourierApplication.findById(id);
  if (!ca) throw new HttpError(404, "Application not found");
  if (ca.status !== "pending") throw new HttpError(400, "Only pending applications can be reviewed.");

  let applicant = ca.userId ? await User.findById(ca.userId) : null;
  const appEmailNorm = (ca.email || "").trim().toLowerCase();

  if (body.action === "reject") {
    ca.status = "rejected";
    ca.adminNote = body.adminNote || "";
    ca.reviewedAt = new Date();
    await ca.save();
    if (ca.userId) {
      await User.updateOne(
        { _id: ca.userId },
        { $set: { riderApplicationStatus: "rejected" as RiderApplicationStatus } }
      );
    }
    await recordAdminAuditEvent({
      actorId: req.user?.id,
      action: "courier.reject",
      title: `Courier rejected — ${ca.fullName.slice(0, 60)}`,
      detail: (body.adminNote || "").slice(0, 500)
    });
    res.json({ ok: true, status: "rejected" });
    return;
  }

  if (!applicant && appEmailNorm) {
    applicant = await User.findOne({ email: appEmailNorm });
  }
  if (!applicant) {
    throw new HttpError(
      400,
      `No shopper account uses ${ca.email}. Ask the applicant to register with this exact email, then approve again.`
    );
  }

  const applicantEmailNorm = ((applicant as { email?: string }).email || "").trim().toLowerCase();
  if (!applicantEmailNorm || applicantEmailNorm !== appEmailNorm) {
    throw new HttpError(
      400,
      "Applicant account email must match the application email before approving a guest submission."
    );
  }

  if (!ca.userId) {
    ca.userId = applicant._id;
    await ca.save();
  }

  const applicantOid = applicant._id as mongoose.Types.ObjectId;

  if (normalizeUserRole(applicant.role) !== "buyer") {
    throw new HttpError(400, "Applicant is not a shopper account; cannot approve as courier.");
  }

  const phone = ca.phone.trim();
  if (!phone) throw new HttpError(400, "Application has no phone number.");

  const phoneTaken = await User.findOne({
    phone,
    _id: { $ne: applicantOid }
  })
    .select("_id")
    .lean();
  if (phoneTaken) {
    throw new HttpError(409, "That phone number is already on another account. Ask the applicant to use a unique number.");
  }

  const existingRp = await RiderProfile.findOne({ userId: applicantOid }).lean();
  if (existingRp) {
    throw new HttpError(400, "This user already has a rider profile.");
  }

  ca.status = "approved";
  ca.adminNote = body.adminNote || "";
  ca.reviewedAt = new Date();
  await ca.save();

  const displayName =
    ((applicant as { displayName?: string }).displayName || "").trim() || ca.fullName.trim();

  await VendorApplication.updateMany(
    { userId: applicantOid, status: "pending" },
    {
      $set: {
        status: "rejected",
        adminNote: "Auto-closed — applicant approved as delivery partner.",
        reviewedAt: new Date()
      }
    }
  );

  await User.updateOne(
    { _id: applicantOid },
    {
      $set: {
        role: "rider",
        phone,
        displayName,
        riderApplicationStatus: "none" as RiderApplicationStatus,
        vendorStatus: "none"
      }
    }
  );

  await RiderProfile.create({
    userId: applicantOid,
    vehicleType: ca.vehicleType.trim()
  });

  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "courier.approve",
    title: `Courier approved — ${ca.fullName.slice(0, 60)}`,
    detail: ca.email
  });
  res.json({ ok: true, status: "approved" });
});

export const deleteAdminCourierApplication = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid application id");
  const doc = await CourierApplication.findById(id);
  if (!doc) throw new HttpError(404, "Application not found");
  if (doc.status === "pending") {
    throw new HttpError(
      400,
      "Approve or reject this application first — pending records cannot be deleted."
    );
  }
  const label = doc.fullName;
  await doc.deleteOne();
  await recordAdminAuditEvent({
    actorId: req.user?.id,
    action: "delete.courierApplication",
    title: `Courier application removed — ${label.slice(0, 60)}`,
    detail: id
  });
  res.status(204).send();
});
