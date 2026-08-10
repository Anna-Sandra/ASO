import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../auth/jwt";
import { Delivery } from "./delivery.model";
import { Order } from "../orders/order.model";
import { normalizeUserRole } from "../auth/user.model";
import { assertDeliveryParticipant, postRiderLocation } from "./delivery.service";
import { setDeliverySocketServer } from "./delivery.broadcast";
import { canActAsOrderBuyer } from "../orders/orderAccess";
import type { Request } from "express";

function tokenFromHandshake(socket: Socket): string | null {
  const a = socket.handshake.auth && (socket.handshake.auth as { token?: string }).token;
  if (typeof a === "string" && a.trim()) return a.trim();
  const h = socket.handshake.headers.authorization;
  if (typeof h === "string" && h.startsWith("Bearer ")) return h.slice("Bearer ".length).trim();
  return null;
}

function guestAuthFromHandshake(socket: Socket): { orderId: string; secret: string } | null {
  const auth = (socket.handshake.auth || {}) as { guestSecret?: string; guestOrderId?: string };
  const secret = String(auth.guestSecret || "").trim();
  const orderId = String(auth.guestOrderId || "").trim();
  if (!secret || !orderId) return null;
  return { orderId, secret };
}

export function setupDeliverySockets(io: Server): void {
  setDeliverySocketServer(io);

  io.use((socket, next) => {
    const t = tokenFromHandshake(socket);
    if (t) {
      try {
        const p = verifyAccessToken(t);
        socket.data.uid = String(p.sub);
        socket.data.role = normalizeUserRole(p.role);
        socket.data.guestSecret = null;
        socket.data.guestOrderId = null;
        return next();
      } catch {
        return next(new Error("Unauthorized"));
      }
    }
    const guest = guestAuthFromHandshake(socket);
    if (guest) {
      socket.data.uid = "";
      socket.data.role = "buyer";
      socket.data.guestSecret = guest.secret;
      socket.data.guestOrderId = guest.orderId;
      return next();
    }
    return next(new Error("Unauthorized"));
  });

  io.on("connection", (socket) => {
    const uid = socket.data.uid as string;
    const role = socket.data.role as ReturnType<typeof normalizeUserRole>;

    socket.on("delivery:subscribe", async (payload: { orderId?: string }, cb) => {
      try {
        const orderId = String(payload?.orderId || "").trim();
        if (!orderId) throw new Error("orderId required");
        const guestSecret = String(socket.data.guestSecret || "").trim();
        const guestOrderId = String(socket.data.guestOrderId || "").trim();

        if (guestSecret) {
          if (orderId !== guestOrderId) throw new Error("Forbidden");
          const order = await Order.findById(orderId).select("+guestAccessSecret");
          if (!order) throw new Error("Order not found");
          const fakeReq = {
            headers: { "x-guest-order-secret": guestSecret },
            body: {},
            user: undefined
          } as unknown as Request;
          if (!canActAsOrderBuyer(fakeReq, order as Parameters<typeof canActAsOrderBuyer>[1])) {
            throw new Error("Forbidden");
          }
        } else {
          const order = await Order.findById(orderId);
          if (!order) throw new Error("Order not found");
          const d = await Delivery.findOne({ orderId: order._id });
          await assertDeliveryParticipant(uid, role, order, d);
        }

        const room = `delivery:${orderId}`;
        await socket.join(room);
        cb?.({ ok: true, room });
      } catch (e: unknown) {
        cb?.({ ok: false, error: String((e as Error)?.message || e) });
      }
    });

    socket.on(
      "delivery:rider-location",
      async (payload: { orderId?: string; latitude?: number; longitude?: number }, cb) => {
        try {
          if (role !== "rider" || socket.data.guestSecret) throw new Error("Forbidden");
          const orderId = String(payload?.orderId || "").trim();
          if (!orderId) throw new Error("orderId required");
          await postRiderLocation({
            orderId,
            riderUserId: uid,
            latitude: Number(payload?.latitude),
            longitude: Number(payload?.longitude)
          });
          cb?.({ ok: true });
        } catch (e: unknown) {
          cb?.({ ok: false, error: String((e as Error)?.message || e) });
        }
      }
    );

    socket.on("disconnect", () => {});
  });
}
