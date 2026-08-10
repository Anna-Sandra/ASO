import mongoose from "mongoose";
import { Delivery } from "../deliveries/delivery.model";
import { Order } from "../orders/order.model";

type LeanOrderLite = {
  _id: mongoose.Types.ObjectId;
  buyerId?: mongoose.Types.ObjectId | null;
  items?: Array<{ sellerId?: mongoose.Types.ObjectId }>;
  updatedAt?: Date;
  createdAt?: Date;
};

/** Active (non-cancelled) delivery assignments involving a rider. */
export async function loadRiderDeliveryLinks(riderId: mongoose.Types.ObjectId) {
  const deliveries = await Delivery.find({
    assignedRiderId: riderId,
    currentStage: { $ne: "cancelled" }
  })
    .select("orderId currentStage updatedAt")
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  if (!deliveries.length) {
    return { buyerIds: [] as string[], sellerIds: [] as string[], byBuyer: new Map<string, string>(), bySeller: new Map<string, string>() };
  }

  const orderIds = deliveries.map((d) => d.orderId);
  const orders = (await Order.find({ _id: { $in: orderIds }, status: { $ne: "cancelled" } })
    .select("buyerId items.sellerId updatedAt createdAt")
    .lean()) as LeanOrderLite[];

  const buyerIds = new Set<string>();
  const sellerIds = new Set<string>();
  const byBuyer = new Map<string, string>();
  const bySeller = new Map<string, string>();

  for (const o of orders) {
    const oid = o._id.toString();
    if (o.buyerId) {
      const bid = o.buyerId.toString();
      buyerIds.add(bid);
      if (!byBuyer.has(bid)) byBuyer.set(bid, oid);
    }
    for (const it of o.items || []) {
      if (!it.sellerId) continue;
      const sid = it.sellerId.toString();
      sellerIds.add(sid);
      if (!bySeller.has(sid)) bySeller.set(sid, oid);
    }
  }

  return {
    buyerIds: [...buyerIds],
    sellerIds: [...sellerIds],
    byBuyer,
    bySeller
  };
}

/** True when rider is assigned on a shared order with this buyer. */
export async function riderSharesOrderWithBuyer(riderId: string, buyerId: string) {
  const deliveries = await Delivery.find({
    assignedRiderId: new mongoose.Types.ObjectId(riderId),
    currentStage: { $ne: "cancelled" }
  })
    .select("orderId")
    .limit(80)
    .lean();
  if (!deliveries.length) return false;
  const hit = await Order.exists({
    _id: { $in: deliveries.map((d) => d.orderId) },
    buyerId: new mongoose.Types.ObjectId(buyerId),
    status: { $ne: "cancelled" }
  });
  return !!hit;
}

/** True when rider is assigned on an order that includes this seller. */
export async function riderSharesOrderWithSeller(riderId: string, sellerId: string) {
  const deliveries = await Delivery.find({
    assignedRiderId: new mongoose.Types.ObjectId(riderId),
    currentStage: { $ne: "cancelled" }
  })
    .select("orderId")
    .limit(80)
    .lean();
  if (!deliveries.length) return false;
  const hit = await Order.exists({
    _id: { $in: deliveries.map((d) => d.orderId) },
    items: { $elemMatch: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
    status: { $ne: "cancelled" }
  });
  return !!hit;
}

/** Riders assigned to this seller's open deliveries. */
export async function loadSellerDeliveryRiders(sellerId: mongoose.Types.ObjectId) {
  const orders = await Order.find({
    "items.sellerId": sellerId,
    status: { $ne: "cancelled" }
  })
    .select("_id")
    .sort({ updatedAt: -1 })
    .limit(120)
    .lean();
  if (!orders.length) return [] as string[];
  const deliveries = await Delivery.find({
    orderId: { $in: orders.map((o) => o._id) },
    assignedRiderId: { $ne: null },
    currentStage: { $ne: "cancelled" }
  })
    .select("assignedRiderId")
    .lean();
  return [
    ...new Set(
      deliveries
        .map((d) => (d.assignedRiderId ? d.assignedRiderId.toString() : ""))
        .filter(Boolean)
    )
  ];
}

/** Rider assigned to this buyer's open deliveries. */
export async function loadBuyerDeliveryRiders(buyerId: mongoose.Types.ObjectId) {
  const orders = await Order.find({ buyerId, status: { $ne: "cancelled" } })
    .select("_id")
    .sort({ updatedAt: -1 })
    .limit(120)
    .lean();
  if (!orders.length) return [] as string[];
  const deliveries = await Delivery.find({
    orderId: { $in: orders.map((o) => o._id) },
    assignedRiderId: { $ne: null },
    currentStage: { $ne: "cancelled" }
  })
    .select("assignedRiderId")
    .lean();
  return [
    ...new Set(
      deliveries
        .map((d) => (d.assignedRiderId ? d.assignedRiderId.toString() : ""))
        .filter(Boolean)
    )
  ];
}
