import type { Server } from "socket.io";

let io: Server | null = null;

export function setDeliverySocketServer(server: Server) {
  io = server;
}

export function emitDeliveryLocation(orderId: string, payload: unknown) {
  io?.to(`delivery:${orderId}`).volatile.emit("delivery:location", payload);
}

export function emitDeliveryUpdate(orderId: string, payload: unknown) {
  io?.to(`delivery:${orderId}`).emit("delivery:update", payload);
}
