import type { Request } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import type { OrderDoc } from "./order.model";

export function newGuestOrderSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Guest orders carry a secret (returned once at checkout) so the buyer can pay and view the order
 * without an account. Pass via `X-Guest-Order-Secret` header or `guestSecret` in JSON body.
 */
export function readGuestSecretFromRequest(req: Request): string {
  const h = req.headers["x-guest-order-secret"];
  const fromHeader = (Array.isArray(h) ? h[0] : h) as string | undefined;
  const trimmedHeader = String(fromHeader ?? "").trim();
  if (trimmedHeader) return trimmedHeader;
  const b = (req.body as { guestSecret?: unknown } | undefined)?.guestSecret;
  return typeof b === "string" ? b.trim() : "";
}

/**
 * True if the request may act as the buyer for this order (signed-in owner, admin, or valid guest secret).
 * For guest secret checks, pass `order` loaded with `.select("+guestAccessSecret")`.
 */
export function canActAsOrderBuyer(
  req: Request,
  order: OrderDoc & { guestAccessSecret?: string | null },
  guestSecret?: string
): boolean {
  const uid = req.user?.id;
  if (uid && req.user?.role === "admin") return true;
  if (order.buyerId && uid && order.buyerId.toString() === uid) return true;
  const secret = guestSecret ?? readGuestSecretFromRequest(req);
  if (!order.buyerId && secret && order.guestAccessSecret && timingSafeEqualStr(secret, String(order.guestAccessSecret))) {
    return true;
  }
  return false;
}

/** Sender id for synthetic "buyer" timeline entries on guest orders (not a real user). */
export const GUEST_ORDER_MESSAGE_SENDER_ID = new mongoose.Types.ObjectId("000000000000000000000001");
