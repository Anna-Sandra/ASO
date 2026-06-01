import mongoose from "mongoose";
import { env } from "../../config/env";
import { User } from "../auth/user.model";
import { Product } from "../products/product.model";
import { CartSnapshot } from "../cart/cartSnapshot.model";
import { Order } from "./order.model";
import { sendAbandonedCartEmail, sendAbandonedCheckoutEmail } from "../../utils/abandonedCartEmail";
import { isEmailTransportConfigured } from "../../config/env";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_CART_AGE_MS = 48 * 60 * 60 * 1000;

/** Remind buyers about unpaid checkouts and idle saved carts (once each). */
export async function runAbandonedCartReminders(): Promise<void> {
  if (!isEmailTransportConfigured()) return;

  const now = Date.now();
  const checkoutCutoff = new Date(now - TWO_HOURS_MS);
  const cartSince = new Date(now - MAX_CART_AGE_MS);
  const cartCutoff = new Date(now - TWO_HOURS_MS);

  const pendingOrders = await Order.find({
    status: "pending_payment",
    createdAt: { $lte: checkoutCutoff },
    $or: [{ abandonedCheckoutReminderSentAt: null }, { abandonedCheckoutReminderSentAt: { $exists: false } }]
  })
    .select("_id total guestContact buyerId")
  .limit(25)
    .lean();

  for (const o of pendingOrders) {
    let email = "";
    let name = "";
    if (o.buyerId) {
      const u = await User.findById(o.buyerId).select("email displayName").lean();
      email = String(u?.email || "").trim();
      name = String(u?.displayName || "").trim();
    } else if (o.guestContact?.email) {
      email = String(o.guestContact.email).trim();
      name = String(o.guestContact.displayName || "").trim();
    }
    if (!email) continue;
    const sent = await sendAbandonedCheckoutEmail({
      to: email,
      displayName: name,
      orderId: (o._id as mongoose.Types.ObjectId).toString(),
      totalGhs: Number(o.total) || 0
    });
    if (sent.ok) {
      await Order.updateOne({ _id: o._id }, { $set: { abandonedCheckoutReminderSentAt: new Date() } });
    }
  }

  const snapshots = await CartSnapshot.find({
    updatedAt: { $gte: cartSince, $lte: cartCutoff },
    $or: [{ abandonedReminderSentAt: null }, { abandonedReminderSentAt: { $exists: false } }],
    "items.0": { $exists: true }
  })
    .limit(25)
    .lean();

  const shop = env.APP_ORIGIN.replace(/\/$/, "");

  for (const snap of snapshots) {
    const u = await User.findById(snap.buyerId).select("email displayName").lean();
    const email = String(u?.email || "").trim();
    if (!email) continue;

    const pids = snap.items.map((it) => it.productId);
    const products = await Product.find({ _id: { $in: pids } })
      .select("name")
      .lean();
    const nameById = new Map(products.map((p) => [p._id.toString(), String(p.name || "Item")]));
    const parts = snap.items.slice(0, 4).map((it) => {
      const nm = nameById.get(it.productId.toString()) || "Item";
      return `${nm} ×${it.quantity}`;
    });
    const summary = parts.join(", ") + (snap.items.length > 4 ? ` +${snap.items.length - 4} more` : "");

    const sent = await sendAbandonedCartEmail({
      to: email,
      displayName: String(u?.displayName || ""),
      itemSummary: summary,
      checkoutUrl: `${shop}/checkout`
    });
    if (sent.ok) {
      await CartSnapshot.updateOne({ _id: snap._id }, { $set: { abandonedReminderSentAt: new Date() } });
    }
  }
}
