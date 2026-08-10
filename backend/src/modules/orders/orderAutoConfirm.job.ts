import mongoose from "mongoose";
import { Order } from "./order.model";
import { fireNotification } from "../notifications/notification.service";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

/** If buyer never confirms, auto-confirm receipt 5 days after `deliveredAt` (does not release vendor payout — admin escrow release required). */
export async function runAutoConfirmDeliveredOrders(): Promise<void> {
  const cutoff = new Date(Date.now() - FIVE_DAYS_MS);
  const candidates = await Order.find({
    status: "delivered",
    buyerConfirmedReceiptAt: null,
    deliveredAt: { $ne: null, $lte: cutoff }
  })
    .select("_id buyerId")
    .limit(40)
    .lean();

  for (const row of candidates) {
    const updated = await Order.findOneAndUpdate(
      { _id: row._id, status: "delivered", buyerConfirmedReceiptAt: null },
      { $set: { buyerConfirmedReceiptAt: new Date() } },
      { new: true }
    ).lean();
    if (!updated) continue;
    const bid = (row as { buyerId?: mongoose.Types.ObjectId }).buyerId;
    if (bid) {
      fireNotification(bid, {
        type: "order_status_change",
        title: "Order confirmed (auto)",
        message:
          "Your delivered order was auto-confirmed after 5 days. Vendor payout is released by the platform after delivery verification.",
        orderId: row._id as mongoose.Types.ObjectId
      });
    }
  }
}
