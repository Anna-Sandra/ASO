import mongoose from "mongoose";
import type { HydratedDocument } from "mongoose";
import { Delivery, DELIVERY_STAGES, type DeliveryDoc, type DeliveryStage } from "./delivery.model";
import { Order, type OrderDoc, type OrderStatus } from "../orders/order.model";
import { RiderProfile } from "./riderProfile.model";
import { User, publicPhoneForPaymentRole } from "../auth/user.model";
import { HttpError } from "../../utils/httpError";
import { rewriteStoredMediaUrl } from "../../utils/publicMediaUrl";
import type { UserRole } from "../auth/user.model";
import { emitDeliveryLocation, emitDeliveryUpdate } from "./delivery.broadcast";
import { notifyBuyerOrderStatus } from "../notifications/notification.service";
import { sendOrderDeliveredEmails } from "../../utils/orderDeliveredEmail";

const TRACKABLE_ORDER: OrderStatus[] = ["paid", "processing", "sent_for_delivery", "delivered"];

const STAGE_INDEX: Record<DeliveryStage, number> = {
  order_placed: 0,
  confirmed: 1,
  preparing: 2,
  ready_for_pickup: 3,
  picked_up: 4,
  on_the_way: 5,
  delivered: 6,
  cancelled: -1
};

function isPaidLike(status: OrderStatus): boolean {
  return TRACKABLE_ORDER.includes(status);
}

export function serializeDelivery(d: HydratedDocument<DeliveryDoc>) {
  const o = d.toObject();
  return {
    id: o._id.toString(),
    orderId: o.orderId.toString(),
    assignedRiderId: o.assignedRiderId ? o.assignedRiderId.toString() : null,
    currentStage: o.currentStage,
    dropoffLatitude: o.dropoffLatitude ?? null,
    dropoffLongitude: o.dropoffLongitude ?? null,
    dropoffLabel: o.dropoffLabel || "",
    riderLatitude: o.riderLatitude ?? null,
    riderLongitude: o.riderLongitude ?? null,
    riderLocationUpdatedAt: o.riderLocationUpdatedAt ?? null,
    estimatedArrivalMinutes: o.estimatedArrivalMinutes ?? null,
    riderAssignedAt: o.riderAssignedAt ?? null,
    proofPhotoUrl: rewriteStoredMediaUrl(o.proofPhotoUrl || ""),
    customerSignatureUrl: rewriteStoredMediaUrl(o.customerSignatureUrl || ""),
    receivedByName: o.receivedByName || "",
    deliveryNote: o.deliveryNote || "",
    deliveredAt: o.deliveredAt ?? null,
    statusHistory: (o.statusHistory || []).map((h) => ({
      stage: h.stage,
      at: h.at,
      byUserId: h.byUserId ? String(h.byUserId) : null,
      note: h.note || ""
    }))
  };
}

async function sellerTouchesOrder(uid: string, order: HydratedDocument<OrderDoc>): Promise<boolean> {
  const oid = new mongoose.Types.ObjectId(uid);
  return order.items.some((it) => it.sellerId.equals(oid));
}

export async function assertDeliveryParticipant(
  userId: string,
  role: UserRole,
  order: HydratedDocument<OrderDoc>,
  delivery: HydratedDocument<DeliveryDoc> | null
): Promise<void> {
  const buyer = Boolean(order.buyerId && order.buyerId.toString() === userId);
  if (role === "admin" || buyer) return;
  if (role === "seller" && (await sellerTouchesOrder(userId, order))) return;
  if (role === "rider" && delivery?.assignedRiderId && delivery.assignedRiderId.toString() === userId) return;
  throw new HttpError(403, "Forbidden");
}

function applyOrderDropoffToDelivery(d: HydratedDocument<DeliveryDoc>, order: HydratedDocument<OrderDoc> | OrderDoc): boolean {
  let changed = false;
  const lat = order.dropoffLatitude;
  const lng = order.dropoffLongitude;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (d.dropoffLatitude == null) {
      d.dropoffLatitude = lat;
      changed = true;
    }
    if (d.dropoffLongitude == null) {
      d.dropoffLongitude = lng;
      changed = true;
    }
  }
  const label = String(order.dropoffLabel || "").trim();
  if (label && !String(d.dropoffLabel || "").trim()) {
    d.dropoffLabel = label.slice(0, 500);
    changed = true;
  }
  return changed;
}

export async function ensureDeliveryForOrder(order: HydratedDocument<OrderDoc>): Promise<HydratedDocument<DeliveryDoc> | null> {
  if (!isPaidLike(order.status)) return null;

  let d = await Delivery.findOne({ orderId: order._id });
  if (d) {
    if (applyOrderDropoffToDelivery(d, order)) {
      await d.save();
      emitDeliveryUpdate(order._id.toString(), { delivery: serializeDelivery(d), orderStatus: order.status });
    }
    return d;
  }

  const lat = order.dropoffLatitude;
  const lng = order.dropoffLongitude;
  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  d = await Delivery.create({
    orderId: order._id,
    currentStage: "order_placed",
    dropoffLatitude: hasCoords ? lat : null,
    dropoffLongitude: hasCoords ? lng : null,
    dropoffLabel: String(order.dropoffLabel || "").trim().slice(0, 500),
    statusHistory: [{ stage: "order_placed", at: new Date(), note: "Order is paid — delivery tracking started" }]
  });

  emitDeliveryUpdate(order._id.toString(), { delivery: serializeDelivery(d), orderStatus: order.status });
  return d;
}

function pushHistory(
  d: HydratedDocument<DeliveryDoc>,
  stage: DeliveryStage,
  byUserId: mongoose.Types.ObjectId | null,
  note?: string
) {
  d.statusHistory = d.statusHistory || [];
  d.statusHistory.push({
    stage,
    at: new Date(),
    ...(byUserId ? { byUserId } : {}),
    ...(note ? { note } : {})
  });
}

async function persistAndBroadcast(
  d: HydratedDocument<DeliveryDoc>,
  order: HydratedDocument<OrderDoc>
): Promise<void> {
  await d.save();
  emitDeliveryUpdate(order._id.toString(), {
    delivery: serializeDelivery(d),
    orderStatus: order.status
  });
}

export async function mirrorOrderStatusToDelivery(order: HydratedDocument<OrderDoc>): Promise<void> {
  if (!isPaidLike(order.status)) return;

  const dInit = await ensureDeliveryForOrder(order);
  if (!dInit) return;
  const d = await Delivery.findById(dInit._id);
  if (!d || d.currentStage === "cancelled") return;

  const bump = (
    stages: DeliveryStage[],
    actorNote: string
  ): void => {
    for (const st of stages) {
      const curIdx = STAGE_INDEX[d.currentStage];
      const nextIdx = STAGE_INDEX[st];
      if (curIdx >= STAGE_INDEX.delivered || d.currentStage === "cancelled") break;
      if (nextIdx > curIdx) {
        pushHistory(d, st, null, actorNote);
        d.currentStage = st;
      }
    }
  };

  switch (order.status) {
    case "paid":
      break;
    case "processing":
      bump(["confirmed", "preparing"], "Synced: vendor preparing order");
      break;
    case "sent_for_delivery":
      bump(["confirmed", "preparing"], "Fulfillment progression");
      bump(["ready_for_pickup"], "Synced: sent for delivery / ready for rider");
      break;
    case "delivered":
      bump(["confirmed", "preparing", "ready_for_pickup"], "Fulfillment progression");
      if (STAGE_INDEX[d.currentStage] < STAGE_INDEX.delivered) {
        pushHistory(d, "delivered", null, "Synced: order marked delivered");
        d.currentStage = "delivered";
      }
      break;
    default:
      break;
  }

  await d.save();
  emitDeliveryUpdate(order._id.toString(), { delivery: serializeDelivery(d), orderStatus: order.status });
}

async function finalizeOrderDelivered(order: HydratedDocument<OrderDoc>) {
  const allowedPrev = ["paid", "processing", "sent_for_delivery"];
  if (!allowedPrev.includes(order.status)) return;
  order.status = "delivered";
  (order as unknown as { deliveredAt?: Date | null }).deliveredAt = new Date();
  await order.save();
  if (order.buyerId) void notifyBuyerOrderStatus(order._id.toString(), order.buyerId, "Delivered");
  void sendOrderDeliveredEmails(order);
}

export async function assignRiderToDelivery(params: {
  orderId: string;
  riderUserId: string;
  actorId: string;
  actorRole: UserRole;
}): Promise<HydratedDocument<DeliveryDoc>> {
  const { orderId, riderUserId } = params;
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  const d0 = await ensureDeliveryForOrder(order);
  if (!d0) throw new HttpError(400, "Delivery tracking starts after payment.");
  const d = await Delivery.findById(d0._id);
  if (!d) throw new HttpError(500, "Delivery missing");

  await assertDeliveryParticipant(params.actorId, params.actorRole, order, d);
  if (params.actorRole !== "admin" && params.actorRole !== "seller") {
    throw new HttpError(403, "Only admins or vendors may assign riders.");
  }
  if (params.actorRole === "seller" && !(await sellerTouchesOrder(params.actorId, order))) {
    throw new HttpError(403, "Forbidden");
  }

  const rider = await RiderProfile.findOne({ userId: new mongoose.Types.ObjectId(riderUserId) }).lean();
  if (!rider) throw new HttpError(400, "Rider profile not found for this user.");

  d.assignedRiderId = new mongoose.Types.ObjectId(riderUserId);
  d.riderAssignedAt = new Date();
  pushHistory(d, d.currentStage, new mongoose.Types.ObjectId(params.actorId), `Rider assigned`);
  await persistAndBroadcast(d, order);
  return d;
}

export async function patchDeliveryDropoff(params: {
  orderId: string;
  actorId: string;
  actorRole: UserRole;
  latitude?: number;
  longitude?: number;
  label?: string;
}): Promise<HydratedDocument<DeliveryDoc>> {
  const order = await Order.findById(params.orderId);
  if (!order) throw new HttpError(404, "Order not found");
  let d = await Delivery.findOne({ orderId: order._id });
  if (!d) {
    const created = await ensureDeliveryForOrder(order);
    d = created || (await Delivery.findOne({ orderId: order._id }));
  }
  if (!d) throw new HttpError(400, "Delivery not active.");

  await assertDeliveryParticipant(params.actorId, params.actorRole, order, d);
  if (params.actorRole === "buyer" || params.actorRole === "rider") {
    throw new HttpError(403, "Only staff may set the drop-off location.");
  }

  if (params.latitude !== undefined) d.dropoffLatitude = params.latitude;
  if (params.longitude !== undefined) d.dropoffLongitude = params.longitude;
  if (params.label !== undefined) d.dropoffLabel = params.label.slice(0, 500);

  pushHistory(d, d.currentStage, new mongoose.Types.ObjectId(params.actorId), "Drop-off updated");
  await persistAndBroadcast(d, order);
  return d;
}

export async function setEstimatedArrival(params: {
  orderId: string;
  actorId: string;
  actorRole: UserRole;
  minutes: number;
}): Promise<HydratedDocument<DeliveryDoc>> {
  const order = await Order.findById(params.orderId);
  if (!order) throw new HttpError(404, "Order not found");
  const d = await Delivery.findOne({ orderId: order._id });
  if (!d) throw new HttpError(404, "Delivery not found");

  await assertDeliveryParticipant(params.actorId, params.actorRole, order, d);
  if (!["seller", "admin", "rider"].includes(params.actorRole)) throw new HttpError(403, "Forbidden");
  if (params.actorRole === "rider" && d.assignedRiderId?.toString() !== params.actorId) {
    throw new HttpError(403, "Forbidden");
  }

  d.estimatedArrivalMinutes = Math.max(0, Math.min(10080, Math.round(params.minutes)));
  pushHistory(d, d.currentStage, new mongoose.Types.ObjectId(params.actorId), `ETA ~${d.estimatedArrivalMinutes} min`);
  await persistAndBroadcast(d, order);
  return d;
}

const sellerStages: DeliveryStage[] = ["confirmed", "preparing", "ready_for_pickup"];

export async function advanceDeliveryStage(params: {
  orderId: string;
  nextStage: DeliveryStage;
  actorId: string;
  actorRole: UserRole;
  proof?: {
    proofPhotoUrl?: string;
    receivedByName?: string;
    customerSignatureUrl?: string;
    deliveryNote?: string;
  };
}): Promise<HydratedDocument<DeliveryDoc>> {
  if (!DELIVERY_STAGES.includes(params.nextStage)) throw new HttpError(400, "Unknown stage.");

  const order = await Order.findById(params.orderId);
  if (!order) throw new HttpError(404, "Order not found");
  let d = await Delivery.findOne({ orderId: order._id });
  if (!d) {
    const c = await ensureDeliveryForOrder(order);
    d = c || (await Delivery.findOne({ orderId: order._id }));
  }
  if (!d) throw new HttpError(400, "Delivery not active.");

  await assertDeliveryParticipant(params.actorId, params.actorRole, order, d);

  if (params.nextStage === "cancelled") {
    if (params.actorRole !== "admin" && params.actorRole !== "seller") throw new HttpError(403, "Forbidden");
    if (params.actorRole === "seller" && !(await sellerTouchesOrder(params.actorId, order))) {
      throw new HttpError(403, "Forbidden");
    }
    pushHistory(d, "cancelled", new mongoose.Types.ObjectId(params.actorId), "Cancelled");
    d.currentStage = "cancelled";
    await persistAndBroadcast(d, order);
    return d;
  }

  if (sellerStages.includes(params.nextStage) || params.nextStage === "order_placed") {
    if (!(params.actorRole === "seller" || params.actorRole === "admin")) throw new HttpError(403, "Forbidden");
    if (params.actorRole === "seller" && !(await sellerTouchesOrder(params.actorId, order))) throw new HttpError(403, "Forbidden");
    if (params.nextStage === "order_placed") throw new HttpError(400, "Cannot revert to placed.");
    if (STAGE_INDEX[d.currentStage] >= STAGE_INDEX.delivered || d.currentStage === "cancelled") {
      throw new HttpError(400, "Already finalized.");
    }
    if (STAGE_INDEX[params.nextStage] <= STAGE_INDEX[d.currentStage]) {
      throw new HttpError(400, "Stages must advance forward.");
    }

    pushHistory(d, params.nextStage, new mongoose.Types.ObjectId(params.actorId));
    d.currentStage = params.nextStage;
    if (params.nextStage === "ready_for_pickup" && ["paid", "processing"].includes(order.status)) {
      order.status = "sent_for_delivery";
      await order.save();
    }
    await persistAndBroadcast(d, order);
    return d;
  }

  if (params.nextStage === "picked_up" || params.nextStage === "on_the_way" || params.nextStage === "delivered") {
    if (!(params.actorRole === "admin" || (params.actorRole === "rider" && d.assignedRiderId?.toString() === params.actorId))) {
      throw new HttpError(403, "Only assigned rider or admin.");
    }
    if (!d.assignedRiderId) throw new HttpError(400, "Assign a rider before pickup phases.");
    if (STAGE_INDEX[d.currentStage] >= STAGE_INDEX.delivered || d.currentStage === "cancelled") {
      throw new HttpError(400, "Already delivered.");
    }
    if (params.actorRole !== "admin") {
      const mustNext: Partial<Record<DeliveryStage, DeliveryStage>> = {
        ready_for_pickup: "picked_up",
        picked_up: "on_the_way",
        on_the_way: "delivered"
      };
      if (mustNext[d.currentStage] !== params.nextStage) {
        throw new HttpError(400, "Follow the rider sequence: pickup → on the way → delivered.");
      }
    }

    pushHistory(d, params.nextStage, new mongoose.Types.ObjectId(params.actorId));

    if (params.nextStage === "picked_up" && ["paid", "processing"].includes(order.status)) {
      order.status = "sent_for_delivery";
      await order.save();
    }

    if (params.nextStage === "delivered") {
      if (params.actorRole === "rider" && !String(params.proof?.proofPhotoUrl || "").trim()) {
        throw new HttpError(400, "A delivery photo is required to mark delivered.");
      }
      const proofUrl = String(params.proof?.proofPhotoUrl || "").trim();
      if (proofUrl) d.proofPhotoUrl = proofUrl.slice(0, 2000);
      const sigUrl = String(params.proof?.customerSignatureUrl || "").trim();
      if (sigUrl) d.customerSignatureUrl = sigUrl.slice(0, 2000);
      const recv = String(params.proof?.receivedByName || "").trim();
      if (recv) d.receivedByName = recv.slice(0, 120);
      const note = String(params.proof?.deliveryNote || "").trim();
      if (note) d.deliveryNote = note.slice(0, 500);
      d.deliveredAt = new Date();
      await finalizeOrderDelivered(order);
    }

    d.currentStage = params.nextStage;
    const refreshed = await Order.findById(order._id);
    await persistAndBroadcast(d, refreshed || order);
    return d;
  }

  throw new HttpError(400, "Use vendor order actions or rider stages for this transition.");
}

export async function postRiderLocation(params: {
  orderId: string;
  riderUserId: string;
  latitude: number;
  longitude: number;
}): Promise<HydratedDocument<DeliveryDoc>> {
  const order = await Order.findById(params.orderId);
  if (!order) throw new HttpError(404, "Order not found");

  const d = await Delivery.findOne({ orderId: order._id });
  if (!d) throw new HttpError(404, "Delivery not found");
  if (!d.assignedRiderId || d.assignedRiderId.toString() !== params.riderUserId) {
    throw new HttpError(403, "Not the assigned rider.");
  }
  const lat = Number(params.latitude);
  const lng = Number(params.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, "Invalid coordinates.");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new HttpError(400, "Coordinates out of range.");

  if (!["ready_for_pickup", "picked_up", "on_the_way"].includes(d.currentStage)) {
    throw new HttpError(400, "Location sharing allowed only during active courier stages.");
  }

  d.riderLatitude = lat;
  d.riderLongitude = lng;
  d.riderLocationUpdatedAt = new Date();
  await d.save();

  emitDeliveryLocation(order._id.toString(), {
    latitude: lat,
    longitude: lng,
    updatedAt: d.riderLocationUpdatedAt
  });
  emitDeliveryUpdate(order._id.toString(), { delivery: serializeDelivery(d), orderStatus: order.status });
  return d;
}

export async function getDeliveryBundleForOrder(orderId: string) {
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  let d = await Delivery.findOne({ orderId: order._id }).exec();
  if (!d && isPaidLike(order.status)) {
    await ensureDeliveryForOrder(order);
    d = await Delivery.findOne({ orderId: order._id }).exec();
  }

  let riderSummary: Record<string, unknown> | null = null;
  if (d?.assignedRiderId) {
    const prof = await RiderProfile.findOne({ userId: d.assignedRiderId }).lean();
    const u = prof ? await User.findById(d.assignedRiderId).select("displayName phone profileImageUrl").lean() : null;
    riderSummary =
      prof && u
        ? {
            vehicleType: prof.vehicleType,
            photoUrl: rewriteStoredMediaUrl(prof.photoUrl || ""),
            displayName: (u as { displayName?: string }).displayName || "",
            phone: (u as { phone?: string }).phone || "",
            profileImageUrl: rewriteStoredMediaUrl((u as { profileImageUrl?: string }).profileImageUrl || "")
          }
        : null;
  }

  return {
    order: order.toObject() as unknown as Record<string, unknown>,
    delivery: d ? serializeDelivery(d as HydratedDocument<DeliveryDoc>) : null,
    rider: riderSummary
  };
}

export async function listRiderAssignments(riderUserId: string): Promise<
  Array<{
    delivery: ReturnType<typeof serializeDelivery>;
    orderId: string;
    orderStatus: string;
  }>
> {
  const oid = new mongoose.Types.ObjectId(riderUserId);
  const rows = await Delivery.find({
    assignedRiderId: oid,
    currentStage: { $nin: ["delivered", "cancelled"] }
  }).sort({ updatedAt: -1 });

  const out: Array<{
    delivery: ReturnType<typeof serializeDelivery>;
    orderId: string;
    orderStatus: string;
  }> = [];
  for (const d of rows) {
    const order = await Order.findById(d.orderId).select("status").lean();
    out.push({
      delivery: serializeDelivery(d),
      orderId: d.orderId.toString(),
      orderStatus: (order?.status as string) || "unknown"
    });
  }
  return out;
}

/** Active couriers vendors/admins can assign — sorted by fewest active jobs first. */
export async function listAvailableRiders(): Promise<
  Array<{
    id: string;
    displayName: string;
    phone: string;
    vehicleType: string;
    profileImageUrl: string;
    activeDeliveries: number;
  }>
> {
  const riders = await User.find({ role: "rider", accountStatus: "active" })
    .select("displayName phone profileImageUrl")
    .sort({ displayName: 1, createdAt: -1 })
    .lean();

  if (!riders.length) return [];

  const userIds = riders.map((u) => u._id);
  const profiles = await RiderProfile.find({ userId: { $in: userIds } }).lean();
  const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

  const activeCounts = await Delivery.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    {
      $match: {
        assignedRiderId: { $in: userIds },
        currentStage: { $nin: ["delivered", "cancelled"] }
      }
    },
    { $group: { _id: "$assignedRiderId", count: { $sum: 1 } } }
  ]);
  const countByRider = new Map(activeCounts.map((r) => [r._id.toString(), r.count]));

  const out = riders
    .filter((u) => profileByUser.has(u._id.toString()))
    .map((u) => {
      const prof = profileByUser.get(u._id.toString())!;
      return {
        id: u._id.toString(),
        displayName: String((u as { displayName?: string }).displayName || "").trim() || "Courier",
        phone: publicPhoneForPaymentRole("rider", (u as { phone?: string }).phone),
        vehicleType: prof.vehicleType || "",
        profileImageUrl: rewriteStoredMediaUrl((u as { profileImageUrl?: string }).profileImageUrl || ""),
        activeDeliveries: countByRider.get(u._id.toString()) || 0
      };
    });

  out.sort((a, b) => a.activeDeliveries - b.activeDeliveries || a.displayName.localeCompare(b.displayName));
  return out;
}
