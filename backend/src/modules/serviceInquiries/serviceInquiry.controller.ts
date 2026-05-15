import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { Product } from "../products/product.model";
import { ServiceInquiry } from "./serviceInquiry.model";
import { fireNotification } from "../notifications/notification.service";
import { User } from "../auth/user.model";

function serializeInquiry(doc: {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  productName: string;
  message: string;
  preferredTime?: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: doc._id.toString(),
    buyerId: doc.buyerId.toString(),
    sellerId: doc.sellerId.toString(),
    productId: doc.productId.toString(),
    productName: doc.productName,
    message: doc.message,
    preferredTime: doc.preferredTime || "",
    status: doc.status,
    createdAt: doc.createdAt
  };
}

export const createServiceInquiry = asyncHandler(async (req: Request, res: Response) => {
  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const { productId, message, preferredTime } = req.body as {
    productId: string;
    message: string;
    preferredTime?: string;
  };

  const p = await Product.findById(productId).select("sellerId category name status").lean();
  if (!p) throw new HttpError(404, "Product not found");
  if (String(p.category) !== "services") {
    throw new HttpError(400, "Booking requests are only available for service listings.");
  }
  if (String(p.status) !== "active") {
    throw new HttpError(400, "This listing is not accepting requests right now.");
  }
  const sellerId = p.sellerId as mongoose.Types.ObjectId;
  if (sellerId.equals(buyerId)) throw new HttpError(400, "You cannot request your own service.");

  const recent = await ServiceInquiry.findOne({
    buyerId,
    productId: new mongoose.Types.ObjectId(productId),
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
  })
    .select("_id")
    .lean();
  if (recent) {
    throw new HttpError(
      429,
      "You already sent a request for this service in the last hour. The seller was notified — check back later or open Messages if you already share an order thread."
    );
  }

  const doc = await ServiceInquiry.create({
    buyerId,
    sellerId,
    productId: new mongoose.Types.ObjectId(productId),
    productName: String(p.name || "Service").trim().slice(0, 220),
    message: message.trim().slice(0, 4000),
    preferredTime: (preferredTime || "").trim().slice(0, 500),
    status: "pending"
  });

  const buyer = await User.findById(buyerId).select("displayName email").lean();
  const buyerLabel =
    ((buyer as { displayName?: string; email?: string } | null)?.displayName || "").trim() ||
    ((buyer as { displayName?: string; email?: string } | null)?.email || "").trim() ||
    "A buyer";
  const preview = message.length > 200 ? `${message.slice(0, 200)}…` : message;
  fireNotification(sellerId, {
    type: "message_received",
    title: "Service booking request",
    message: `${buyerLabel} requested «${String(p.name || "service")}»: ${preview}`,
    orderId: null
  });

  res.status(201).json({ inquiry: serializeInquiry(doc.toObject()) });
});

export const listMyServiceInquiries = asyncHandler(async (req: Request, res: Response) => {
  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await ServiceInquiry.find({ buyerId }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ inquiries: rows.map((r) => serializeInquiry(r)) });
});

export const listSellerServiceInquiries = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await ServiceInquiry.find({ sellerId }).sort({ createdAt: -1 }).limit(200).lean();
  const buyerIds = [...new Set(rows.map((r) => (r.buyerId as mongoose.Types.ObjectId).toString()))].map(
    (s) => new mongoose.Types.ObjectId(s)
  );
  const buyers = buyerIds.length
    ? await User.find({ _id: { $in: buyerIds } })
        .select("displayName email")
        .lean()
    : [];
  const nameById = new Map(
    buyers.map((u) => {
      const label =
        ((u as { displayName?: string; email?: string }).displayName || "").trim() ||
        ((u as { displayName?: string; email?: string }).email || "").trim() ||
        "Buyer";
      return [u._id.toString(), label];
    })
  );
  res.json({
    inquiries: rows.map((r) => ({
      ...serializeInquiry(r),
      buyerDisplayName: nameById.get((r.buyerId as mongoose.Types.ObjectId).toString()) || "Buyer"
    }))
  });
});

export const patchServiceInquiry = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid id");
  const { status } = req.body as { status: "read" | "archived" };

  const doc = await ServiceInquiry.findOne({ _id: id, sellerId });
  if (!doc) throw new HttpError(404, "Inquiry not found");
  doc.status = status;
  await doc.save();
  res.json({ inquiry: serializeInquiry(doc.toObject()) });
});
