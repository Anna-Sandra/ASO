import mongoose from "mongoose";
import { User } from "../auth/user.model";
import { roundMoney, splitLineGross } from "../../utils/commission";
import { isPaystackRefundRemoteSettled } from "../payments/paystackRefundSync";
import { redactContactSharingInText } from "../../utils/contactSharingGuard";

export function serializePaymentDetails(p: unknown): Record<string, unknown> | null {
  if (!p || typeof p !== "object") return null;
  const r = p as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof r.momoPhone === "string") out.momoPhone = r.momoPhone;
  if (typeof r.momoAmount === "number") out.momoAmount = r.momoAmount;
  if (typeof r.cardLast4 === "string") out.cardLast4 = r.cardLast4;
  if (typeof r.cardholderName === "string") out.cardholderName = r.cardholderName;
  if (typeof r.cardExpiry === "string") out.cardExpiry = r.cardExpiry;
  return Object.keys(out).length ? out : null;
}

/** True when buyer reimbursement is complete (same rules as serialized `refundStatus`). */
export function isOrderNetRevenueZeroedByRefund(o: {
  refundStatus?: unknown;
  paymentMethod?: unknown;
  paystackRefundId?: unknown;
  paystackRefundRemoteStatus?: unknown;
}): boolean {
  return (
    normalizeRefundStatus(
      o.refundStatus,
      o.paymentMethod,
      o.paystackRefundId,
      o.paystackRefundRemoteStatus
    ) === "refunded"
  );
}

/**
 * Orders to omit from admin gross / platform-fee totals. Slightly broader than {@link isOrderNetRevenueZeroedByRefund}:
 * Paystack refunds often stay `refund_processing` in the UI until webhooks sync, but finance should not keep commission
 * once `refundStatus` is `refunded` and Paystack has a refund id.
 */
export function isOrderExcludedFromRevenueMetrics(o: {
  refundStatus?: unknown;
  paymentMethod?: unknown;
  paystackRefundId?: unknown;
  paystackRefundRemoteStatus?: unknown;
}): boolean {
  if (isOrderNetRevenueZeroedByRefund(o)) return true;
  if (o.refundStatus !== "refunded") return false;
  if (o.paymentMethod !== "paystack") return true;
  const idNum = o.paystackRefundId != null && o.paystackRefundId !== "" ? Number(o.paystackRefundId) : NaN;
  return Number.isFinite(idNum) && idNum > 0;
}

function normalizeRefundStatus(
  raw: unknown,
  paymentMethod: unknown,
  paystackRefundId: unknown,
  paystackRefundRemoteStatus?: unknown
): "none" | "requested" | "refund_processing" | "refunded" {
  let s: "none" | "requested" | "refund_processing" | "refunded" =
    raw === "requested" || raw === "refund_processing" || raw === "refunded" ? raw : "none";
  if (s === "refunded" && paymentMethod === "paystack") {
    const idNum = paystackRefundId != null && paystackRefundId !== "" ? Number(paystackRefundId) : NaN;
    const hasId = Number.isFinite(idNum) && idNum > 0;
    const remote = String(paystackRefundRemoteStatus ?? "").toLowerCase();
    if (!hasId) {
      s = "requested";
    } else if (!isPaystackRefundRemoteSettled(remote)) {
      s = "refund_processing";
    }
  }
  return s;
}

function serializeLineItem(it: Record<string, unknown>) {
  const qty = Number(it.quantity);
  const unitPrice = Number(it.unitPrice);
  const lineGross = roundMoney(unitPrice * qty);
  let platformFee: number;
  let sellerProceeds: number;
  if (typeof it.platformFee === "number" && typeof it.sellerProceeds === "number") {
    platformFee = it.platformFee;
    sellerProceeds = it.sellerProceeds;
  } else {
    const s = splitLineGross(lineGross);
    platformFee = s.platformFee;
    sellerProceeds = s.sellerProceeds;
  }
  const bn = typeof it.buyerNote === "string" && it.buyerNote.trim() ? it.buyerNote.trim() : undefined;
  return {
    productId: (it.productId as mongoose.Types.ObjectId).toString(),
    sellerId: (it.sellerId as mongoose.Types.ObjectId).toString(),
    name: it.name,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    lineGross,
    platformFee,
    sellerProceeds,
    ...(bn ? { buyerNote: bn } : {})
  };
}

export type SerializeOrderOpts = {
  /** When true, redact phone/email patterns in order thread messages. */
  redactMessageContacts?: boolean;
};

export function serializeOrder(o: Record<string, unknown>, opts?: SerializeOrderOpts) {
  const items = ((o.items as Array<Record<string, unknown>>) || []).map(serializeLineItem);
  const platformFeeTotal = roundMoney(items.reduce((s, it) => s + it.platformFee, 0));
  const sellerProceedsTotal = roundMoney(items.reduce((s, it) => s + it.sellerProceeds, 0));
  const pricingVersion = Number((o as { pricingVersion?: number }).pricingVersion) || 1;
  const subtotalNum = roundMoney(Number(o.subtotal));
  const totalNum = roundMoney(Number(o.total));
  const storedProc = (o as { processingFeeTotal?: number }).processingFeeTotal;
  let processingFeeTotal = 0;
  if (pricingVersion >= 2) {
    processingFeeTotal = roundMoney(
      typeof storedProc === "number" ? storedProc : Math.max(0, totalNum - subtotalNum - platformFeeTotal)
    );
  }
  const paystackRefundIdRaw = (o as { paystackRefundId?: number | null }).paystackRefundId;
  const rawBuyerId = o.buyerId as mongoose.Types.ObjectId | null | undefined;
  return {
    id: (o._id as mongoose.Types.ObjectId).toString(),
    buyerId: rawBuyerId ? rawBuyerId.toString() : null,
    items,
    currency: o.currency,
    subtotal: o.subtotal,
    total: o.total,
    pricingVersion,
    platformFeeTotal,
    sellerProceedsTotal,
    serviceFeeTotal: platformFeeTotal,
    processingFeeTotal,
    status: o.status,
    paymentMethod: o.paymentMethod ?? null,
    paymentReference: o.paymentReference ?? null,
    paymentDetails: serializePaymentDetails(o.paymentDetails),
    confirmedSellerIds: (
      (o.confirmedSellerIds as mongoose.Types.ObjectId[] | undefined) || []
    ).map((id) => id.toString()),
    messages: ((o.messages as Array<Record<string, unknown>>) || []).map((m) => {
      const rawText = String(m.text ?? "");
      return {
        senderId: (m.senderId as mongoose.Types.ObjectId).toString(),
        senderRole: m.senderRole,
        text: opts?.redactMessageContacts ? redactContactSharingInText(rawText) : rawText,
        createdAt: m.createdAt
      };
    }),
    stripeCheckoutSessionId: o.stripeCheckoutSessionId,
    paystackReference: (o as { paystackReference?: string | null }).paystackReference ?? null,
    paystackTransactionId: (o as { paystackTransactionId?: number | null }).paystackTransactionId ?? null,
    disputeOpen: Boolean((o as { disputeOpen?: boolean }).disputeOpen),
    adminNote: (o as { adminNote?: string }).adminNote ?? "",
    refundStatus: normalizeRefundStatus(
      (o as { refundStatus?: unknown }).refundStatus,
      o.paymentMethod,
      paystackRefundIdRaw,
      (o as { paystackRefundRemoteStatus?: string }).paystackRefundRemoteStatus
    ),
    paystackRefundId: paystackRefundIdRaw ?? null,
    paystackRefundRemoteStatus: String((o as { paystackRefundRemoteStatus?: string }).paystackRefundRemoteStatus || ""),
    refundStockRestored: Boolean((o as { refundStockRestored?: boolean }).refundStockRestored),
    refundFulfillmentWasDelivered:
      typeof (o as { refundFulfillmentWasDelivered?: unknown }).refundFulfillmentWasDelivered === "boolean"
        ? (o as { refundFulfillmentWasDelivered: boolean }).refundFulfillmentWasDelivered
        : null,
    fulfillmentMode: (o as { fulfillmentMode?: string }).fulfillmentMode === "onsite" ? "onsite" : "delivery",
    deliveredAt: (o as { deliveredAt?: Date | null }).deliveredAt ?? null,
    buyerConfirmedReceiptAt: (o as { buyerConfirmedReceiptAt?: Date | null }).buyerConfirmedReceiptAt ?? null,
    pointsRedeemed: Number((o as { pointsRedeemed?: number }).pointsRedeemed) || 0,
    firstOrderDiscountApplied: Boolean((o as { firstOrderDiscountApplied?: boolean }).firstOrderDiscountApplied),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  };
}

export type SellerContactSerialized = {
  id: string;
  email: string;
  phone: string;
  displayName: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
};

export type WithContactsOpts = {
  /** MoMo/card fields the buyer submitted for off-platform payment — admin + buyer only. */
  includeBuyerPaymentDetails?: boolean;
  /** Admin-only: include raw buyer/seller email and phone on orders. */
  includePrivateContactDetails?: boolean;
};

export async function withContacts(rows: Record<string, unknown>[], opts?: WithContactsOpts) {
  const includeBuyerPaymentDetails = Boolean(opts?.includeBuyerPaymentDetails);
  const includePrivateContactDetails = Boolean(opts?.includePrivateContactDetails);
  const redactMessageContacts = !includePrivateContactDetails;
  const buyerIds = new Set<string>();
  const sellerIds = new Set<string>();
  for (const o of rows) {
    const bid = o.buyerId as mongoose.Types.ObjectId | null | undefined;
    if (bid) buyerIds.add(bid.toString());
    for (const it of o.items as Array<Record<string, unknown>>) {
      sellerIds.add((it.sellerId as mongoose.Types.ObjectId).toString());
    }
  }
  const ids = [...new Set([...buyerIds, ...sellerIds])];
  const users = ids.length
    ? await User.find({ _id: { $in: ids } })
        .select("_id email phone displayName bankName bankAccountNumber bankAccountName")
        .lean()
    : [];
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  return rows.map((o) => {
    const base = serializeOrder(o, { redactMessageContacts });
    const rawBuyerId = o.buyerId as mongoose.Types.ObjectId | null | undefined;
    const buyerId = rawBuyerId ? rawBuyerId.toString() : "";
    const guestContact = (o as { guestContact?: { displayName?: string; email?: string; phone?: string } }).guestContact;
    const sellerContactById: Record<string, SellerContactSerialized> = {};
    for (const it of o.items as Array<Record<string, unknown>>) {
      const sid = (it.sellerId as mongoose.Types.ObjectId).toString();
      const su = byId.get(sid);
      if (!sellerContactById[sid]) {
        sellerContactById[sid] = includePrivateContactDetails
          ? {
              id: sid,
              email: su?.email ?? "",
              phone: su?.phone ?? "",
              displayName: su?.displayName ?? "",
              bankName: (su as { bankName?: string } | undefined)?.bankName ?? "",
              bankAccountNumber: (su as { bankAccountNumber?: string } | undefined)?.bankAccountNumber ?? "",
              bankAccountName: (su as { bankAccountName?: string } | undefined)?.bankAccountName ?? ""
            }
          : {
              id: sid,
              email: "",
              phone: "",
              displayName: su?.displayName ?? "",
              bankName: "",
              bankAccountNumber: "",
              bankAccountName: ""
            };
      }
    }
    const bu = buyerId ? byId.get(buyerId) : null;
    const redacted = includeBuyerPaymentDetails
      ? base
      : { ...base, paymentDetails: null };
    return {
      ...redacted,
      buyerContact: buyerId
        ? {
            id: buyerId,
            email: includePrivateContactDetails ? bu?.email ?? "" : "",
            phone: includePrivateContactDetails ? bu?.phone ?? "" : "",
            displayName: bu?.displayName ?? ""
          }
        : {
            id: "",
            email: includePrivateContactDetails ? String(guestContact?.email ?? "").trim() : "",
            phone: includePrivateContactDetails ? String(guestContact?.phone ?? "").trim() : "",
            displayName: String(guestContact?.displayName ?? "").trim()
          },
      sellerContacts: Object.values(sellerContactById)
    };
  });
}
