import mongoose from "mongoose";
import { Order } from "./order.model";
import { maybeReleaseVendorPayoutAfterConfirm } from "./orderPaymentSideEffects";
import { fireNotification } from "../notifications/notification.service";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

/** If buyer never confirms, auto-confirm receipt 5 days after `deliveredAt` and trigger legacy Paystack transfers when enabled. */
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
    const id = (row._id as mongoose.Types.ObjectId).toString();
    const updated = await Order.findOneAndUpdate(
      { _id: row._id, status: "delivered", buyerConfirmedReceiptAt: null },
      { $set: { buyerConfirmedReceiptAt: new Date() } },
      { new: true }
    ).lean();
    if (!updated) continue;
    void maybeReleaseVendorPayoutAfterConfirm(id);
    const bid = (row as { buyerId?: mongoose.Types.ObjectId }).buyerId;
    if (bid) {
      fireNotification(bid, {
        type: "order_status_change",
        title: "Order confirmed (auto)",
        message:
          "Your delivered order was auto-confirmed after 5 days. Sellers were notified; payouts run when your Paystack transfer mode is enabled.",
        orderId: row._id as mongoose.Types.ObjectId
      });
    }
  }
}
