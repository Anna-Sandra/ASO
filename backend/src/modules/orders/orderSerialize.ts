import mongoose from "mongoose";
import { User } from "../auth/user.model";
import { roundMoney, splitLineGross } from "../../utils/commission";

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
  return {
    productId: (it.productId as mongoose.Types.ObjectId).toString(),
    sellerId: (it.sellerId as mongoose.Types.ObjectId).toString(),
    name: it.name,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    lineGross,
    platformFee,
    sellerProceeds
  };
}

export function serializeOrder(o: Record<string, unknown>) {
  const items = ((o.items as Array<Record<string, unknown>>) || []).map(serializeLineItem);
  const platformFeeTotal = roundMoney(items.reduce((s, it) => s + it.platformFee, 0));
  const sellerProceedsTotal = roundMoney(items.reduce((s, it) => s + it.sellerProceeds, 0));
  return {
    id: (o._id as mongoose.Types.ObjectId).toString(),
    buyerId: (o.buyerId as mongoose.Types.ObjectId).toString(),
    items,
    currency: o.currency,
    subtotal: o.subtotal,
    total: o.total,
    platformFeeTotal,
    sellerProceedsTotal,
    status: o.status,
    paymentMethod: o.paymentMethod ?? null,
    paymentReference: o.paymentReference ?? null,
    paymentDetails: serializePaymentDetails(o.paymentDetails),
    confirmedSellerIds: (
      (o.confirmedSellerIds as mongoose.Types.ObjectId[] | undefined) || []
    ).map((id) => id.toString()),
    messages: ((o.messages as Array<Record<string, unknown>>) || []).map((m) => ({
      senderId: (m.senderId as mongoose.Types.ObjectId).toString(),
      senderRole: m.senderRole,
      text: m.text,
      createdAt: m.createdAt
    })),
    stripeCheckoutSessionId: o.stripeCheckoutSessionId,
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

export async function withContacts(rows: Record<string, unknown>[]) {
  const buyerIds = new Set<string>();
  const sellerIds = new Set<string>();
  for (const o of rows) {
    buyerIds.add((o.buyerId as mongoose.Types.ObjectId).toString());
    for (const it of o.items as Array<Record<string, unknown>>) {
      sellerIds.add((it.sellerId as mongoose.Types.ObjectId).toString());
    }
  }
  const ids = [...new Set([...buyerIds, ...sellerIds])];
  const users = await User.find({ _id: { $in: ids } })
    .select("_id email phone displayName bankName bankAccountNumber bankAccountName")
    .lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  return rows.map((o) => {
    const base = serializeOrder(o);
    const buyerId = (o.buyerId as mongoose.Types.ObjectId).toString();
    const sellerContactById: Record<string, SellerContactSerialized> = {};
    for (const it of o.items as Array<Record<string, unknown>>) {
      const sid = (it.sellerId as mongoose.Types.ObjectId).toString();
      const su = byId.get(sid);
      if (!sellerContactById[sid]) {
        sellerContactById[sid] = {
          id: sid,
          email: su?.email ?? "",
          phone: su?.phone ?? "",
          displayName: su?.displayName ?? "",
          bankName: (su as { bankName?: string } | undefined)?.bankName ?? "",
          bankAccountNumber: (su as { bankAccountNumber?: string } | undefined)?.bankAccountNumber ?? "",
          bankAccountName: (su as { bankAccountName?: string } | undefined)?.bankAccountName ?? ""
        };
      }
    }
    const bu = byId.get(buyerId);
    return {
      ...base,
      buyerContact: {
        id: buyerId,
        email: bu?.email ?? "",
        phone: bu?.phone ?? "",
        displayName: bu?.displayName ?? ""
      },
      sellerContacts: Object.values(sellerContactById)
    };
  });
}
