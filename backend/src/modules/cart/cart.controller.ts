import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { CartSnapshot } from "./cartSnapshot.model";

/** Persist buyer cart for abandoned-cart recovery emails. */
export const upsertCartSnapshot = asyncHandler(async (req: Request, res: Response) => {
  const buyerId = new mongoose.Types.ObjectId(req.user!.id);
  const raw = (req.body as { items?: { productId: string; quantity: number }[] }).items || [];
  const items = raw
    .filter((it) => mongoose.isValidObjectId(it.productId))
    .map((it) => ({
      productId: new mongoose.Types.ObjectId(it.productId),
      quantity: Math.min(99, Math.max(1, Math.floor(Number(it.quantity) || 1)))
    }));
  if (!items.length) {
    await CartSnapshot.deleteOne({ buyerId });
    res.json({ ok: true, saved: false });
    return;
  }
  await CartSnapshot.findOneAndUpdate(
    { buyerId },
    { $set: { items, abandonedReminderSentAt: null }, $currentDate: { updatedAt: true } },
    { upsert: true }
  );
  res.json({ ok: true, saved: true });
});
