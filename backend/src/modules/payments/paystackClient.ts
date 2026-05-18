import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";

const PAYSTACK_BASE = "https://api.paystack.co";

export async function paystackPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new HttpError(503, "Paystack not configured");

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const json = (await res.json()) as { status?: boolean; message?: string; data?: T };
  if (!json.status || json.data === undefined) {
    const msg = typeof json.message === "string" && json.message.trim() ? json.message.trim() : "Paystack request failed";
    throw new HttpError(400, msg);
  }
  return json.data;
}

export async function paystackGet<T>(path: string): Promise<T> {
  const key = env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new HttpError(503, "Paystack not configured");

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` }
  });

  const json = (await res.json()) as { status?: boolean; message?: string; data?: T };
  if (!json.status || json.data === undefined) {
    const msg = typeof json.message === "string" && json.message.trim() ? json.message.trim() : "Paystack request failed";
    throw new HttpError(400, msg);
  }
  return json.data;
}
