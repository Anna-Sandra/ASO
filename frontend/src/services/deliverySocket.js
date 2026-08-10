import { io } from "socket.io-client";
import { getApiBase } from "services/api";

/**
 * Socket.IO must hit the HTTP API origin. When `REACT_APP_API_URL` is unset locally,
 * default to hostname:4000 (backend default port).
 */
export function deliverySocketUrl() {
  const b = String(getApiBase() || "").replace(/\/$/, "");
  if (b) return b;
  if (typeof window === "undefined") return "";
  if (process.env.NODE_ENV === "development") return `${window.location.protocol}//${window.location.hostname}:4000`;
  return window.location.origin;
}

/**
 * @param {string} [accessToken]
 * @param {{ guestSecret?: string; guestOrderId?: string }} [guest]
 */
export function openDeliverySocket(accessToken, guest) {
  const url = deliverySocketUrl();
  const auth = {};
  if (accessToken) auth.token = accessToken;
  if (guest?.guestSecret && guest?.guestOrderId) {
    auth.guestSecret = guest.guestSecret;
    auth.guestOrderId = guest.guestOrderId;
  }
  return io(url || (typeof window !== "undefined" ? window.location.origin : ""), {
    auth,
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnectionAttempts: 8
  });
}
