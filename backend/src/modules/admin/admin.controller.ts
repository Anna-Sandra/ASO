import type { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { roundMoney, splitLineGross } from "../../utils/commission";
import { User, normalizeUserRole, publicPhoneForPaymentRole } from "../auth/user.model";
import { Order } from "../orders/order.model";
import { withContacts } from "../orders/orderSerialize";
import { Product } from "../products/product.model";
import { Conversation } from "../conversations/conversation.model";
import { Report } from "../reports/report.model";
import { clearCommissionCache, getEffectiveCommissionPercent, getOrCreateSettings } from "../platform/platformSettings.service";
import {
  adminListQuerySchema,
  adminOrderPatchSchema,
  adminOrdersQuerySchema,
  adminPatchUserSchema,
  adminPlatformSettingsSchema,
  adminProductPatchSchema,
  adminProductsQuerySchema,
  adminRejectProductSchema,
  adminReportPatchSchema,
  adminReportsQuerySchema,
  adminResetPasswordSchema,
  adminUsersQuerySchema
} from "./admin.schemas";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const recentOrders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();
  const recentSerialized = await withContacts(recentOrders as unknown as Record<string, unknown>[]);

  const recentSignups = await User.find()
    .select("email displayName role createdAt")
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();
  const recentListings = await Product.find()
    .select("name status sellerId createdAt")
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();
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
      }))
    }
  });
});

export const listAdminUsers = asyncHandler(async (req: Request, res: Response) => {
  const q = adminUsersQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const filter: Record<string, unknown> = {};
  if (q.role !== "all") filter.role = q.role;
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
    users: rowsDeduped.map((u) => ({
      id: u._id.toString(),
      email: u.email ?? "",
      phone: publicPhoneForPaymentRole(normalizeUserRole((u as { role: string }).role), (u as { phone?: string }).phone),
      displayName: (u as { displayName?: string }).displayName ?? "",
      role: (u as { role: string }).role,
      accountStatus: (u as { accountStatus?: string }).accountStatus ?? "active",
      sellerVerified: Boolean((u as { sellerVerified?: boolean }).sellerVerified),
      createdAt: u.createdAt
    })),
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
  if (u.role === "admin" && (body as { accountStatus?: string }).accountStatus && (body as { accountStatus: string }).accountStatus !== "active") {
    const admins = await User.countDocuments({ role: "admin" });
    if (admins <= 1) throw new HttpError(400, "Cannot change the only admin account this way");
  }
  if (body.accountStatus !== undefined) (u as { accountStatus: string }).accountStatus = body.accountStatus;
  if (body.sellerVerified !== undefined) (u as { sellerVerified: boolean }).sellerVerified = body.sellerVerified;
  await u.save();
  res.json({ ok: true, user: { id: u._id.toString(), accountStatus: (u as { accountStatus?: string }).accountStatus, sellerVerified: (u as { sellerVerified?: boolean }).sellerVerified } });
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
      imageUrls: (p as { imageUrls?: string[] }).imageUrls || [],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    })),
    total,
    page: q.page,
    limit: q.limit
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
  res.json({ ok: true, product: { id: p._id.toString(), status: p.status, rejectionReason: reason } });
});

export const listAdminOrders = asyncHandler(async (req: Request, res: Response) => {
  const q = adminOrdersQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const filter: Record<string, unknown> = {};
  if (q.status && q.status !== "all") filter.status = q.status;
  if (q.dispute === "yes") filter.disputeOpen = true;
  if (q.dispute === "no") filter.disputeOpen = { $ne: true };
  if (q.refund !== "all") filter.refundStatus = q.refund;
  if (q.search) {
    const s = q.search.trim();
    const re = new RegExp(escapeRegex(s), "i");
    const or: Record<string, unknown>[] = [{ "items.name": re }];
    if (mongoose.isValidObjectId(s)) {
      or.push({ _id: new mongoose.Types.ObjectId(s) });
    }
    filter.$or = or;
  }
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

export const getAdminPlatformSettings = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await getOrCreateSettings();
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    settings: {
      commissionPercent: doc.commissionPercent,
      momoEnabled: doc.momoEnabled,
      stripeEnabled: doc.stripeEnabled,
      bankEnabled: doc.bankEnabled,
      listingPolicyNote: doc.listingPolicyNote
    },
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
  await doc.save();
  clearCommissionCache();
  res.json({ ok: true, settings: { commissionPercent: doc.commissionPercent, momoEnabled: doc.momoEnabled, stripeEnabled: doc.stripeEnabled, bankEnabled: doc.bankEnabled, listingPolicyNote: doc.listingPolicyNote } });
});

export const listAdminReports = asyncHandler(async (req: Request, res: Response) => {
  const q = adminReportsQuerySchema.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.status && q.status !== "all") {
    filter.status = q.status;
  }
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ description: re }, { adminNote: re }, { targetId: re }];
  }
  const skip = (q.page - 1) * q.limit;
  const [rows, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit).lean(),
    Report.countDocuments(filter)
  ]);
  const ids = [
    ...new Set(rows.map((r) => r.reporterId.toString()).filter(Boolean)),
    ...new Set(
      rows
        .map((r) => r.resolvedById?.toString())
        .filter((x): x is string => Boolean(x))
    )
  ];
  const users = await User.find({ _id: { $in: ids.map((x) => new mongoose.Types.ObjectId(x)) } })
    .select("email displayName")
    .lean();
  const umap = new Map(users.map((u) => [u._id.toString(), ((u as { displayName?: string; email?: string }).displayName || "").trim() || (u as { email?: string }).email || "—"]));
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    reports: rows.map((r) => ({
      id: r._id.toString(),
      reporterId: r.reporterId.toString(),
      reporterLabel: umap.get(r.reporterId.toString()) || "—",
      category: r.category,
      description: r.description,
      targetType: r.targetType,
      targetId: r.targetId,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      resolvedById: r.resolvedById?.toString(),
      resolvedByLabel: r.resolvedById ? umap.get(r.resolvedById.toString()) : null
    })),
    total,
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
  r.status = body.status;
  if (body.adminNote !== undefined) r.adminNote = body.adminNote;
  if (body.status === "resolved" || body.status === "dismissed") {
    r.resolvedAt = new Date();
    r.resolvedById = new mongoose.Types.ObjectId(req.user!.id);
  } else {
    r.resolvedAt = undefined;
    r.set("resolvedById", null);
  }
  await r.save();
  res.json({ ok: true, report: { id: r._id.toString(), status: r.status } });
});

export const getAdminRevenue = asyncHandler(async (req: Request, res: Response) => {
  const daysRaw = typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 30;
  const days = Math.min(365, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30));
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const orders = await Order.find({ createdAt: { $gte: start }, status: { $ne: "cancelled" } })
    .select("items createdAt total status")
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
  const uids = [c.buyerId, c.sellerId];
  const users = await User.find({ _id: { $in: uids } })
    .select("email displayName")
    .lean();
  const umap = new Map(users.map((u) => [u._id.toString(), { email: (u as { email?: string }).email ?? "", name: (u as { displayName?: string }).displayName ?? "" }]));
  const msgs = (c.messages || []) as Array<{ senderId: mongoose.Types.ObjectId; senderRole: string; text: string; createdAt: Date }>;
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    thread: {
      id: c._id.toString(),
      buyerId: c.buyerId.toString(),
      sellerId: c.sellerId.toString(),
      buyerLabel: (umap.get(c.buyerId.toString())?.name || "").trim() || umap.get(c.buyerId.toString())?.email || "—",
      sellerLabel: (umap.get(c.sellerId.toString())?.name || "").trim() || umap.get(c.sellerId.toString())?.email || "—",
      messages: sortMsgs(msgs)
    }
  });
});

function sortMsgs(msgs: Array<{ createdAt: Date }>) {
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
  res.json({
    user: {
      id: u._id.toString(),
      email: (u as { email?: string }).email ?? "",
      phone: publicPhoneForPaymentRole(
        normalizeUserRole((u as { role: string }).role),
        (u as { phone?: string }).phone
      ),
      displayName: (u as { displayName?: string }).displayName ?? "",
      role: (u as { role: string }).role,
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

export const resetAdminUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid user id");
  const { newPassword } = adminResetPasswordSchema.parse(req.body);
  const u = await User.findById(id).select("+passwordHash");
  if (!u) throw new HttpError(404, "User not found");
  u.passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT);
  await u.save();
  res.json({ ok: true });
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
  if (body.refundStatus !== undefined) (o as { refundStatus: string }).refundStatus = body.refundStatus;
  await o.save();
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
  res.json({ ok: true, product: { id: p._id.toString(), name: p.name, status: p.status, flagged: (p as { flagged?: boolean }).flagged } });
});

export const deleteAdminProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  await p.deleteOne();
  res.status(204).send();
});
