import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../auth/jwt";
import { Delivery } from "./delivery.model";
import { Order } from "../orders/order.model";
import { normalizeUserRole } from "../auth/user.model";
import { assertDeliveryParticipant, postRiderLocation } from "./delivery.service";
import { setDeliverySocketServer } from "./delivery.broadcast";

function tokenFromHandshake(socket: Socket): string | null {
  const a = socket.handshake.auth && (socket.handshake.auth as { token?: string }).token;
  if (typeof a === "string" && a.trim()) return a.trim();
  const h = socket.handshake.headers.authorization;
  if (typeof h === "string" && h.startsWith("Bearer ")) return h.slice("Bearer ".length).trim();
  return null;
}

export function setupDeliverySockets(io: Server): void {
  setDeliverySocketServer(io);

  io.use((socket, next) => {
    const t = tokenFromHandshake(socket);
    if (!t) return next(new Error("Unauthorized"));
    try {
      const p = verifyAccessToken(t);
      socket.data.uid = String(p.sub);
      socket.data.role = normalizeUserRole(p.role);
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const uid = socket.data.uid as string;
    const role = socket.data.role as ReturnType<typeof normalizeUserRole>;

    socket.on("delivery:subscribe", async (payload: { orderId?: string }, cb) => {
      try {
        const orderId = String(payload?.orderId || "").trim();
        if (!orderId) throw new Error("orderId required");
        const order = await Order.findById(orderId);
        if (!order) throw new Error("Order not found");
        const d = await Delivery.findOne({ orderId: order._id });
        await assertDeliveryParticipant(uid, role, order, d);
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
          if (role !== "rider") throw new Error("Forbidden");
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
