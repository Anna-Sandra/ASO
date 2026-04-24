import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { getEffectiveCommissionPercent } from "../platform/platformSettings.service";
import type { ProductDoc } from "./product.model";
import { Product } from "./product.model";
import { listProductsQuerySchema } from "./product.schemas";

/** Public-facing fields; changes require re-approval if the listing was already live. */
const SELLER_UPDATE_KEYS = [
  "name",
  "description",
  "category",
  "price",
  "compareAtPrice",
  "stock",
  "tags",
  "imageUrls"
] as const;

const MODERATION_REAPPROVE_KEYS = [
  "name",
  "description",
  "category",
  "price",
  "compareAtPrice",
  "tags",
  "imageUrls"
] as const;

type SellerUpdateKey = (typeof SELLER_UPDATE_KEYS)[number];

function fieldChanged(key: string, from: unknown, to: unknown): boolean {
  if (key === "price" || key === "compareAtPrice") {
    const na = from == null || from === "" ? null : Number(from);
    const nb = to == null || to === "" ? null : Number(to);
    if (na == null && nb == null) return false;
    if (na == null || nb == null) return true;
    return na !== nb;
  }
  if (key === "tags" || key === "imageUrls") {
    return JSON.stringify(from ?? []) !== JSON.stringify(to ?? []);
  }
  return String(from ?? "") !== String(to ?? "");
}

function sellerModerationTouched(
  before: ProductDoc,
  body: Record<string, unknown>
): boolean {
  const prev = before as unknown as Record<string, unknown>;
  for (const k of MODERATION_REAPPROVE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    if (fieldChanged(k, prev[k], body[k])) return true;
  }
  return false;
}

function toPublicProduct(p: Record<string, unknown>) {
  return {
    id: (p._id as mongoose.Types.ObjectId).toString(),
    sellerId: (p.sellerId as mongoose.Types.ObjectId).toString(),
    name: p.name,
    description: p.description,
    category: p.category,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    stock: p.stock,
    status: p.status,
    rejectionReason: p.rejectionReason,
    tags: p.tags,
    imageUrls: p.imageUrls,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

async function attachSellerPayments(products: Record<string, unknown>[]) {
  if (!products.length) return [];
  const commissionPercent = await getEffectiveCommissionPercent();
  const sellerIds = [...new Set(products.map((p) => (p.sellerId as mongoose.Types.ObjectId).toString()))];
  const users = await User.find({
    _id: { $in: sellerIds.map((id) => new mongoose.Types.ObjectId(id)) }
  })
    .select("_id displayName phone email bankName bankAccountNumber bankAccountName")
    .lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  return products.map((p) => {
    const base = toPublicProduct(p);
    const su = byId.get((p.sellerId as mongoose.Types.ObjectId).toString());
    if (!su) return base;
    return {
      ...base,
      /** Percent of each line total (price × qty) retained by the marketplace; remainder is the seller’s share. */
      platformCommissionPercent: commissionPercent,
      sellerPayment: {
        displayName: su.displayName ?? "",
        phone: su.phone ?? "",
        email: su.email ?? "",
        bankName: su.bankName ?? "",
        bankAccountNumber: su.bankAccountNumber ?? "",
        bankAccountName: su.bankAccountName ?? ""
      }
    };
  });
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listProductsQuerySchema.safeParse(req.query);
  const q = parsed.success ? parsed.data : {};
  const filter: Record<string, unknown> = { status: "active" };
  if (q.category) filter.category = q.category;
  if (q.tag) filter.tags = q.tag;
  if (q.maxPrice != null) filter.price = { $lte: q.maxPrice };

  let rows;
  if (q.q?.trim()) {
    rows = await Product.find({
      ...filter,
      $text: { $search: q.q.trim() }
    })
      .sort({ score: { $meta: "textScore" } })
      .lean();
  } else {
    rows = await Product.find(filter).sort({ updatedAt: -1 }).lean();
  }
  const enriched = await attachSellerPayments(rows as unknown as Record<string, unknown>[]);
  res.json({ products: enriched });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id).lean();
  if (!p) throw new HttpError(404, "Product not found");
  const isOwner = p.sellerId.toString() === req.user?.id;
  const isAdmin = req.user?.role === "admin";
  if (p.status !== "active" && !isOwner && !isAdmin) {
    throw new HttpError(404, "Product not found");
  }
  const [out] = await attachSellerPayments([p as unknown as Record<string, unknown>]);
  res.json({ product: out });
});

export const listMyProducts = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await Product.find({ sellerId }).sort({ updatedAt: -1 }).lean();
  const enriched = await attachSellerPayments(rows as unknown as Record<string, unknown>[]);
  res.json({ products: enriched });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const body = { ...(req.body as Record<string, unknown>) };
  const existingTags = Array.isArray(body.tags) ? (body.tags as unknown[]).map((t) => String(t)) : [];
  body.tags = [...new Set(["new", ...existingTags])];
  /** "Publish" from the app sends `active`; sellers can never go live without admin. */
  const wantsPublish = body.status === "active";
  const status: ProductDoc["status"] = wantsPublish ? "pending_approval" : "draft";
  delete (body as { status?: unknown }).status;
  const p = await Product.create({ ...body, status, sellerId });
  const [out] = await attachSellerPayments([p.toObject() as unknown as Record<string, unknown>]);
  res.status(201).json({ product: out });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  if (p.sellerId.toString() !== req.user!.id) throw new HttpError(403, "Forbidden");

  const beforeStatus = p.status;
  const beforeDoc = p.toObject() as ProductDoc;
  const body = req.body as Record<string, unknown>;
  const modTouched = sellerModerationTouched(beforeDoc, body);

  for (const key of SELLER_UPDATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    (p as unknown as Record<string, unknown>)[key] = body[key as SellerUpdateKey];
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const st = body.status as string;
    if (st === "draft") {
      p.status = "draft";
    } else if (st === "active") {
      // Sellers cannot set "active" on their own: only "keep live" (no change) or (re)submit for review.
      p.status = beforeStatus === "active" && !modTouched ? "active" : "pending_approval";
    }
  } else if (beforeStatus === "active" && modTouched) {
    p.status = "pending_approval";
  }
  if (p.status !== "rejected" && p.rejectionReason) {
    p.set("rejectionReason", null);
  }
  await p.save();
  const [out] = await attachSellerPayments([p.toObject() as unknown as Record<string, unknown>]);
  res.json({ product: out });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid product id");
  const p = await Product.findById(id);
  if (!p) throw new HttpError(404, "Product not found");
  if (p.sellerId.toString() !== req.user!.id) throw new HttpError(403, "Forbidden");
  await p.deleteOne();
  res.status(204).send();
});
