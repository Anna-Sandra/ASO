/**
 * Marketplace money-out (Paystack):
 *
 * 1. **Checkout split (default)** — When `PAYSTACK_CHECKOUT_SPLIT` is true, `/transaction/initialize` uses
 *    Paystack split payment: each seller’s aggregated `sellerProceeds` (pesewas) goes to their **subaccount**
 *    via `split` (multi-seller) or `subaccount` + `transaction_charge` (single seller). Sellers get
 *    `paystackSubaccountCode` when they save `POST /api/vendor/paystack/payout-account`.
 *
 * 2. **Legacy transfers** — If checkout split is off, the full charge settles to the main merchant balance;
 *    optional `PAYSTACK_AUTO_VENDOR_PAYOUT` runs `POST /transfer` using `paystackTransferRecipientCode`.
 */
import mongoose from "mongoose";
import { env } from "../../config/env";
import { roundMoney } from "../../utils/commission";
import { HttpError } from "../../utils/httpError";
import { Order } from "../orders/order.model";
import { User } from "../auth/user.model";

const PAYSTACK = "https://api.paystack.co";

export type PayoutLine = {
  sellerId: string;
  amountGross: number;
  transferId?: string;
  reference?: string;
  status: "ok" | "skipped_no_recipient" | "error";
  message?: string;
};

async function paystackFetch<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; data?: T; message?: string }> {
  const key = env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) return { ok: false, message: "PAYSTACK_SECRET_KEY not set" };

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (method === "POST" && body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${PAYSTACK}${path}`, {
    method,
    headers,
    body: method === "POST" && body ? JSON.stringify(body) : undefined
  });
  const json = (await res.json()) as { status?: boolean; message?: string; data?: T };
  if (!json.status) {
    return { ok: false, message: json.message || `Paystack error (${res.status})` };
  }
  return { ok: true, data: json.data };
}

/** Create a Paystack **subaccount** (settlement bank / MoMo) for split payments. */
export async function createGhanaSubaccount(params: {
  businessName: string;
  accountNumber: string;
  settlementBank: string;
}): Promise<string> {
  const r = await paystackFetch<{ subaccount_code?: string }>("POST", "/subaccount", {
    business_name: params.businessName.slice(0, 100),
    account_number: params.accountNumber.replace(/\s/g, ""),
    settlement_bank: params.settlementBank.trim(),
    percentage_charge: 0
  });
  if (!r.ok || !r.data?.subaccount_code) {
    throw new Error(r.message || "Paystack could not create subaccount");
  }
  return String(r.data.subaccount_code).trim();
}

export type OrderItemForSplit = { sellerId: mongoose.Types.ObjectId; sellerProceeds: number };

/**
 * Adds Paystack split fields to the `/transaction/initialize` body.
 * @returns `true` if this order should set `paystackUsedCheckoutSplit` on save (skip later transfer payouts).
 */
export async function mergePaystackCheckoutSplitIntoInitializeBody(
  body: Record<string, unknown>,
  amountSubunit: number,
  items: OrderItemForSplit[]
): Promise<boolean> {
  if (!env.PAYSTACK_CHECKOUT_SPLIT) return false;

  const buckets = new Map<string, number>();
  for (const it of items) {
    const sid = String(it.sellerId);
    const ps = Math.max(0, Math.round(roundMoney(Number(it.sellerProceeds)) * 100));
    if (ps > 0) buckets.set(sid, (buckets.get(sid) || 0) + ps);
  }

  if (buckets.size === 0) {
    throw new HttpError(400, "Order has no seller proceeds to split");
  }

  let sumShares = [...buckets.values()].reduce((a, b) => a + b, 0);
  if (sumShares > amountSubunit) {
    const sorted = [...buckets.entries()].sort((x, y) => y[1] - x[1]);
    let over = sumShares - amountSubunit;
    for (let i = 0; i < sorted.length && over > 0; i++) {
      const [k, v] = sorted[i];
      const cut = Math.min(Math.max(0, v - 1), over);
      if (cut > 0) {
        buckets.set(k, v - cut);
        over -= cut;
      }
    }
    sumShares = [...buckets.values()].reduce((a, b) => a + b, 0);
  }
  if (sumShares > amountSubunit) {
    throw new HttpError(400, "Seller shares exceed the Paystack charge amount; check order totals.");
  }

  const sellerIds = [...buckets.keys()].map((id) => new mongoose.Types.ObjectId(id));
  const users = await User.find({ _id: { $in: sellerIds } })
    .select("paystackSubaccountCode businessName displayName email")
    .lean();

  const label = (u: (typeof users)[number] | undefined) =>
    (u?.businessName && String(u.businessName).trim()) ||
    (u?.displayName && String(u.displayName).trim()) ||
    (u?.email && String(u.email).trim()) ||
    "Seller";

  const missingLabels: string[] = [];
  const entries: { sellerId: string; subaccount: string; share: number }[] = [];
  for (const sid of buckets.keys()) {
    const u = users.find((x) => x._id.toString() === sid);
    const acct = String((u as { paystackSubaccountCode?: string })?.paystackSubaccountCode || "").trim();
    if (!acct) {
      missingLabels.push(label(u));
      continue;
    }
    const share = buckets.get(sid) || 0;
    if (share < 1) continue;
    entries.push({ sellerId: sid, subaccount: acct, share });
  }

  if (missingLabels.length) {
    throw new HttpError(
      400,
      "Every seller on this order must save payout details (Store settings) so Paystack can split funds to their subaccount. Missing: " +
        missingLabels.join("; ")
    );
  }

  if (entries.length === 0) {
    throw new HttpError(400, "No payable seller shares after split rounding");
  }

  entries.sort((a, b) => b.share - a.share);

  if (entries.length === 1) {
    const transaction_charge = amountSubunit - entries[0].share;
    if (transaction_charge < 0) {
      throw new HttpError(400, "Invalid Paystack split: seller share is larger than the charge amount.");
    }
    body.subaccount = entries[0].subaccount;
    body.transaction_charge = transaction_charge;
  } else {
    body.split = {
      type: "flat",
      bearer_type: "account",
      subaccounts: entries.map((e) => ({ subaccount: e.subaccount, share: e.share }))
    };
  }

  return true;
}

/**
 * **Legacy:** for each unique seller on the order, `POST /transfer` → “Send vendor share to
 * Vendor A’s bank” using their registered recipient code. Idempotent: `in_progress` → `complete` | `partial` | `skipped`.
 */
export async function runVendorPayoutsForOrder(orderId: string): Promise<void> {
  if (!env.PAYSTACK_AUTO_VENDOR_PAYOUT) return;
  if (!mongoose.isValidObjectId(orderId)) return;

  const peek = await Order.findById(orderId).select("paystackUsedCheckoutSplit").lean();
  if ((peek as { paystackUsedCheckoutSplit?: boolean } | null)?.paystackUsedCheckoutSplit) return;

  const lock = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: ["paid", "processing", "sent_for_delivery", "delivered"] },
      paymentMethod: "paystack",
      $or: [{ paystackPayoutStatus: { $exists: false } }, { paystackPayoutStatus: "none" }]
    },
    { $set: { paystackPayoutStatus: "in_progress" } },
    { new: true }
  );

  if (!lock) return;

  const order = await Order.findById(orderId).lean();
  if (!order || order.status !== "paid" || order.paymentMethod !== "paystack") {
    await Order.findByIdAndUpdate(orderId, { $set: { paystackPayoutStatus: "skipped" } });
    return;
  }

  const bySeller = new Map<string, number>();
  for (const it of order.items) {
    const sid = String(it.sellerId);
    const add = roundMoney(Number(it.sellerProceeds) || 0);
    if (add > 0) {
      bySeller.set(sid, roundMoney((bySeller.get(sid) || 0) + add));
    }
  }

  const results: PayoutLine[] = [];
  let allOk = true;
  let anyTransfer = false;

  for (const [sellerId, amountG] of bySeller) {
    const kobo = Math.round(amountG * 100);
    if (kobo < 1) {
      results.push({ sellerId, amountGross: amountG, status: "skipped_no_recipient", message: "Zero amount" });
      continue;
    }

    const seller = await User.findById(sellerId).select("paystackTransferRecipientCode role").lean();
    const code = (seller as { paystackTransferRecipientCode?: string })?.paystackTransferRecipientCode?.trim();
    if (!code) {
      allOk = false;
      results.push({
        sellerId,
        amountGross: amountG,
        status: "skipped_no_recipient",
        message: "Vendor has not registered a Paystack payout account"
      });
      continue;
    }

    const reference = `pout-${orderId.slice(-8)}-${sellerId.slice(-6)}-${Date.now()}`.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 100);
    anyTransfer = true;
    const tr = await paystackFetch<{ id?: number; reference?: string }>("POST", "/transfer", {
      source: "balance",
      reason: `Order ${orderId} seller share`,
      amount: kobo,
      recipient: code,
      reference
    });

    if (tr.ok && tr.data) {
      results.push({
        sellerId,
        amountGross: amountG,
        status: "ok",
        transferId: tr.data.id != null ? String(tr.data.id) : undefined,
        reference: tr.data.reference || reference
      });
    } else {
      allOk = false;
      results.push({ sellerId, amountGross: amountG, status: "error", message: tr.message });
    }
  }

  const finalStatus = !anyTransfer
    ? "skipped"
    : allOk
      ? "complete"
      : "partial";
  await Order.findByIdAndUpdate(orderId, {
    $set: {
      paystackPayoutStatus: finalStatus,
      paystackPayouts: results.map((r) => ({
        sellerId: new mongoose.Types.ObjectId(r.sellerId),
        amountGross: r.amountGross,
        transferId: r.transferId,
        reference: r.reference,
        status: r.status,
        message: r.message
      }))
    }
  });
}

export type GhanaPayoutChannel = "ghipss" | "mobile_money";

export type GhanaPayoutInstitution = {
  name: string;
  code: string;
  channel: GhanaPayoutChannel;
  id?: number;
  slug?: string;
  longcode?: string;
};

/** Single Paystack /bank list page (may be cursor-paginated). */
async function getPaystackBankListPage(
  pathWithQuery: string
): Promise<{ rows: { name: string; code: string; type?: string }[]; next?: string; ok: boolean; message?: string }> {
  const key = env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) return { rows: [], ok: false, message: "PAYSTACK_SECRET_KEY not set" };
  const res = await fetch(`${PAYSTACK}${pathWithQuery}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` }
  });
  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { name: string; code: string; type?: string }[];
    meta?: { next?: string | null };
  };
  if (!json.status) {
    return { rows: [], ok: false, message: json.message || `Paystack error (${res.status})` };
  }
  const data = json.data;
  const arr = Array.isArray(data) ? data : [];
  return { rows: arr, next: json.meta?.next || undefined, ok: true };
}

/** Fetches all rows for a Ghana /bank query (follows `meta.next` cursors if present). */
async function listGhanaBanksByQuery(
  type: GhanaPayoutChannel
): Promise<{ name: string; code: string; type?: string }[]> {
  const all: { name: string; code: string; type?: string }[] = [];
  let next: string | undefined;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({
      country: "ghana",
      currency: "GHS",
      perPage: "100",
      type: type === "ghipss" ? "ghipss" : "mobile_money"
    });
    if (next) qs.set("next", next);
    const { rows, next: nxt, ok, message: _msg } = await getPaystackBankListPage(`/bank?${qs.toString()}`);
    if (!ok) return all;
    all.push(...rows);
    if (!nxt) break;
    next = nxt;
  }
  return all;
}

/**
 * Ghana institutions for transfer recipients: **banks (GHIPSS)** and **mobile money** (separate `type=`
 * filters; Paystack does not return both in a single unfiltered list reliably).
 */
export async function listPaystackBanksGhana(): Promise<GhanaPayoutInstitution[]> {
  const ghip = await listGhanaBanksByQuery("ghipss");
  const momo = await listGhanaBanksByQuery("mobile_money");
  const seen = new Set<string>();
  const out: GhanaPayoutInstitution[] = [];
  for (const b of ghip) {
    const k = `ghipss|${b.code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      name: b.name,
      code: String(b.code).trim(),
      channel: "ghipss"
    });
  }
  for (const b of momo) {
    const k = `mobile_money|${b.code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      name: b.name,
      code: String(b.code).trim(),
      channel: "mobile_money"
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (out.length) return out;

  /** Last resort: unfiltered list (some API versions) — tag channel from `type` when present. */
  const { rows, ok } = await getPaystackBankListPage(
    "/bank?country=ghana&currency=GHS&perPage=100"
  );
  if (!ok) return [];
  for (const b of rows) {
    const ch: GhanaPayoutChannel =
      (b.type || "").toLowerCase() === "mobile_money" ? "mobile_money" : "ghipss";
    const k = `${ch}|${b.code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: b.name, code: String(b.code).trim(), channel: ch });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}

/** Create a Ghana GHS transfer recipient (bank or mobile money) for payouts. */
export async function createGhanaPayoutRecipient(params: {
  name: string;
  accountNumber: string;
  bankCode: string;
  recipientType: GhanaPayoutChannel;
}): Promise<string> {
  const t = params.recipientType;
  if (t !== "ghipss" && t !== "mobile_money") {
    throw new Error("Invalid recipient type");
  }
  const r = await paystackFetch<{ recipient_code?: string; customer_code?: string }>("POST", "/transferrecipient", {
    type: t,
    name: params.name.slice(0, 100),
    account_number: params.accountNumber.replace(/\s/g, ""),
    bank_code: params.bankCode,
    currency: "GHS"
  });
  const code = r.data?.recipient_code;
  if (!r.ok || !code) {
    throw new Error(r.message || "Paystack could not create transfer recipient");
  }
  return code;
}

/** @deprecated use createGhanaPayoutRecipient with recipientType "ghipss" */
export async function createGhipssRecipient(params: { name: string; accountNumber: string; bankCode: string }): Promise<string> {
  return createGhanaPayoutRecipient({
    name: params.name,
    accountNumber: params.accountNumber,
    bankCode: params.bankCode,
    recipientType: "ghipss"
  });
}
