import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { Product } from "../products/product.model";
import { ServiceInquiry } from "./serviceInquiry.model";
import { fireNotification } from "../notifications/notification.service";
import { User } from "../auth/user.model";
import {
  isOfflineInquiryProductCategory,
  sellerEligibleForOfflineInquiries
} from "./offlineInquiry";
import { assertNoContactSharing, redactContactSharingInText } from "../../utils/contactSharingGuard";

function serializeInquiry(
  doc: {
    _id: mongoose.Types.ObjectId;
    buyerId: mongoose.Types.ObjectId;
    sellerId: mongoose.Types.ObjectId;
    productId: mongoose.Types.ObjectId;
    productName: string;
    message: string;
    preferredTime?: string;
    status: string;
    createdAt: Date;
  },
  extra?: { listingCategory?: string }
) {
  return {
    id: doc._id.toString(),
    buyerId: doc.buyerId.toString(),
    sellerId: doc.sellerId.toString(),
    productId: doc.productId.toString(),
    productName: doc.productName,
    message: redactContactSharingInText(doc.message),
    preferredTime: doc.preferredTime || "",
    status: doc.status,
    createdAt: doc.createdAt,
    ...(extra?.listingCategory ? { listingCategory: extra.listingCategory } : {})
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
  const category = String(p.category || "");
  if (!isOfflineInquiryProductCategory(category)) {
    throw new HttpError(
      400,
      "Contact requests are only available for food and service listings (items without fixed online checkout)."
    );
  }
  if (String(p.status) !== "active") {
    throw new HttpError(400, "This listing is not accepting requests right now.");
  }
  const sellerId = p.sellerId as mongoose.Types.ObjectId;
  if (sellerId.equals(buyerId)) {
    throw new HttpError(400, "You cannot send a request for your own listing.");
  }

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
      "You already sent a request for this listing in the last hour. The seller was notified — check back later or open Messages if you already share an order thread."
    );
  }

  const msg = message.trim().slice(0, 4000);
  const when = (preferredTime || "").trim().slice(0, 500);
  assertNoContactSharing(msg, "Message");
  if (when) assertNoContactSharing(when, "Preferred timing");

  const doc = await ServiceInquiry.create({
    buyerId,
    sellerId,
    productId: new mongoose.Types.ObjectId(productId),
    productName: String(p.name || "Service").trim().slice(0, 220),
    message: msg,
    preferredTime: when,
    status: "pending"
  });

  const buyer = await User.findById(buyerId).select("displayName email").lean();
  const buyerLabel =
    ((buyer as { displayName?: string; email?: string } | null)?.displayName || "").trim() ||
    ((buyer as { displayName?: string; email?: string } | null)?.email || "").trim() ||
    "A buyer";
  const preview = message.length > 200 ? `${message.slice(0, 200)}…` : message;
  const isFood = category === "food_drinks";
  fireNotification(sellerId, {
    type: "message_received",
    title: isFood ? "Food order request" : "Service booking request",
    message: `${buyerLabel} requested «${String(p.name || "listing")}»: ${preview}`,
    orderId: null
  });

  res.status(201).json({ inquiry: serializeInquiry(doc.toObject(), { listingCategory: category }) });
});

export const getOfflineInquiriesEligible = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const eligible = await sellerEligibleForOfflineInquiries(sellerId);
  res.json({ eligible });
});

export const listMyServiceInquiries = asyncHandler(async (req: Request, res: Response) => {
  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const rows = await ServiceInquiry.find({ buyerId }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ inquiries: rows.map((r) => serializeInquiry(r)) });
});

export const listSellerServiceInquiries = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(req.user!.id);
  const eligible = await sellerEligibleForOfflineInquiries(sellerId);
  if (!eligible) {
    res.json({ inquiries: [], eligible: false });
    return;
  }
  const rows = await ServiceInquiry.find({ sellerId }).sort({ createdAt: -1 }).limit(200).lean();
  const productIds = [...new Set(rows.map((r) => (r.productId as mongoose.Types.ObjectId).toString()))].map(
    (s) => new mongoose.Types.ObjectId(s)
  );
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .select("category")
        .lean()
    : [];
  const catByProduct = new Map(products.map((p) => [p._id.toString(), String(p.category || "")]));
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
    eligible: true,
    inquiries: rows.map((r) => {
      const pid = (r.productId as mongoose.Types.ObjectId).toString();
      const listingCategory = catByProduct.get(pid) || "";
      return {
        ...serializeInquiry(r, { listingCategory }),
        buyerDisplayName: nameById.get((r.buyerId as mongoose.Types.ObjectId).toString()) || "Buyer"
      };
    })
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
