import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { Product } from "./product.model";
import { ProductSave } from "./productSave.model";
import { attachSellerPayments } from "./product.controller";

/** UUID v4 (guest save session from `X-Save-Session`). */
const GUEST_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveSaveOwnerKey(req: Request): string {
  if (req.user?.id) {
    return `u:${req.user.id}`;
  }
  const raw = req.headers["x-save-session"];
  const s = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;
  const trimmed = String(s ?? "").trim().toLowerCase();
  if (!trimmed || !GUEST_UUID_RE.test(trimmed)) {
    throw new HttpError(400, "Missing or invalid X-Save-Session header (send a UUID v4).");
  }
  return `g:${trimmed}`;
}

export const listSavedProductIds = asyncHandler(async (req: Request, res: Response) => {
  const ownerKey = resolveSaveOwnerKey(req);
  const rows = await ProductSave.find({ ownerKey }).select("productId").lean();
  const ids = rows.map((r) => (r.productId as mongoose.Types.ObjectId).toString());
  res.json({ ids });
});

export const listSavedProducts = asyncHandler(async (req: Request, res: Response) => {
  const ownerKey = resolveSaveOwnerKey(req);
  const rows = await ProductSave.find({ ownerKey }).sort({ createdAt: -1 }).lean();
  const ids = rows.map((r) => (r.productId as mongoose.Types.ObjectId));
  if (!ids.length) {
    return res.json({ products: [] });
  }
  const products = await Product.find({
    _id: { $in: ids },
    status: "active"
  }).lean();

  const order = new Map(ids.map((id, i) => [id.toString(), i]));
  products.sort((a, b) => (order.get(a._id.toString()) ?? 0) - (order.get(b._id.toString()) ?? 0));

  const enriched = await attachSellerPayments(products as unknown as Record<string, unknown>[]);
  res.json({ products: enriched });
});

export const toggleProductSave = asyncHandler(async (req: Request, res: Response) => {
  const ownerKey = resolveSaveOwnerKey(req);
  const productIdRaw = (req.body as { productId?: string })?.productId;
  const productId = String(productIdRaw ?? "").trim();
  if (!mongoose.isValidObjectId(productId)) {
    throw new HttpError(400, "Invalid product id");
  }
  const pid = new mongoose.Types.ObjectId(productId);

  const product = await Product.findById(pid).select("status").lean();
  if (!product || product.status !== "active") {
    throw new HttpError(404, "Product not found");
  }

  const existing = await ProductSave.findOne({ ownerKey, productId: pid }).select("_id").lean();
  if (existing) {
    await ProductSave.deleteOne({ _id: existing._id });
    return res.json({ saved: false });
  }

  try {
    await ProductSave.create({ ownerKey, productId: pid });
  } catch (e: unknown) {
    if (e && typeof e === "object" && (e as { code?: number }).code === 11000) {
      return res.json({ saved: true });
    }
    throw e;
  }
  res.json({ saved: true });
});
