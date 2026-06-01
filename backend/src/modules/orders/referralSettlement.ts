import mongoose from "mongoose";
import { User } from "../auth/user.model";
import { Order } from "./order.model";
import { fireNotification } from "../notifications/notification.service";
import { REFERRAL_REWARD_POINTS_EACH } from "../../utils/referral";

const PAID_LIKE = ["paid", "processing", "sent_for_delivery", "delivered"] as const;

/** On referee's first paid order: reward both parties once (idempotent). */
export async function runReferralSettlementForPaidOrder(orderId: mongoose.Types.ObjectId): Promise<void> {
  const o = await Order.findById(orderId).select("buyerId status").lean();
  if (!o?.buyerId || !PAID_LIKE.includes(o.status as (typeof PAID_LIKE)[number])) return;

  const buyer = await User.findById(o.buyerId).select("referredByUserId referralBonusGrantedAt").lean();
  if (!buyer) return;
  if (buyer.referralBonusGrantedAt) return;

  const referrerId = (buyer as { referredByUserId?: mongoose.Types.ObjectId }).referredByUserId;
  if (!referrerId) return;

  const priorPaid = await Order.countDocuments({
    buyerId: o.buyerId,
    status: { $in: [...PAID_LIKE] },
    _id: { $ne: orderId }
  });
  if (priorPaid > 0) return;

  const pts = REFERRAL_REWARD_POINTS_EACH;
  await User.updateOne({ _id: o.buyerId }, { $set: { referralBonusGrantedAt: new Date() }, $inc: { rewardPoints: pts } });
  await User.updateOne({ _id: referrerId }, { $inc: { rewardPoints: pts } });

  fireNotification(o.buyerId, {
    type: "loyalty_points",
    title: "Referral bonus",
    message: `Welcome bonus: +${pts} points for your first order (invite reward).`,
    orderId
  });
  fireNotification(referrerId, {
    type: "loyalty_points",
    title: "Referral reward",
    message: `Your invite completed a first order — +${pts} points added.`,
    orderId
  });
}
