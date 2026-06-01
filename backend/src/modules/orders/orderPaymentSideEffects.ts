import mongoose from "mongoose";
import { Order } from "./order.model";
import { User } from "../auth/user.model";
import { runVendorPayoutsForOrder } from "../payments/paystackPayouts";
import { fireNotification } from "../notifications/notification.service";
import { runReferralSettlementForPaidOrder } from "./referralSettlement";

const PAID_LIKE = ["paid", "processing", "sent_for_delivery", "delivered"];

/**
 * After Paystack/Stripe marks an order paid: loyalty points accrual + redeem deduction (stored on order).
 * Idempotent via order.pointsSettlementDone.
 */
export async function runLoyaltySettlementForPaidOrder(orderId: mongoose.Types.ObjectId): Promise<void> {
  const o = await Order.findById(orderId).select(
    "buyerId pointsSettlementDone subtotal pointsRedeemed firstOrderDiscountApplied"
  );
  if (!o?.buyerId || o.pointsSettlementDone) return;

  const redeemPts = Math.max(0, Math.floor(Number((o as { pointsRedeemed?: number }).pointsRedeemed) || 0));
  const earned = Math.max(0, Math.floor(Number(o.subtotal)));

  await User.updateOne(
    { _id: o.buyerId },
    {
      $inc: {
        rewardPoints: earned - redeemPts
      }
    }
  );

  await Order.updateOne({ _id: orderId }, { $set: { pointsSettlementDone: true } });

  const buyer = await User.findById(o.buyerId).select("rewardPoints").lean();
  const bal = Math.max(0, Math.floor(Number((buyer as { rewardPoints?: number })?.rewardPoints) || 0));

  fireNotification(o.buyerId, {
    type: "loyalty_points",
    title: "Points earned",
    message:
      earned > 0
        ? `You earned ${earned} points on this order${redeemPts > 0 ? ` (used ${redeemPts} at checkout).` : "."} Balance ≈ ${bal} pts.`
        : redeemPts > 0
          ? `You used ${redeemPts} points at checkout.`
          : "Thanks for your purchase.",
    orderId
  });

  void runReferralSettlementForPaidOrder(orderId);
}

/** After buyer confirms receipt (or auto-confirm): legacy Paystack transfers if split disabled. */
export async function maybeReleaseVendorPayoutAfterConfirm(orderId: string): Promise<void> {
  await runVendorPayoutsForOrder(orderId);
}
