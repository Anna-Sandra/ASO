import type { Request, Response } from "express";
import mongoose from "mongoose";
import { DEFAULT_SUPPORT_LABEL } from "../../config/brand";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { Order } from "../orders/order.model";
import { Product } from "../products/product.model";
import { Conversation } from "./conversation.model";
import { getPrimarySupportAdminId } from "./supportPeer";
import { fireNotification } from "../notifications/notification.service";
import { assertNoContactSharing, redactContactSharingInText } from "../../utils/contactSharingGuard";
import {
  loadBuyerDeliveryRiders,
  loadRiderDeliveryLinks,
  loadSellerDeliveryRiders,
  riderSharesOrderWithBuyer,
  riderSharesOrderWithSeller
} from "./deliveryChat";

function resolveMsgInbox(
  accountRole: "buyer" | "seller" | "admin" | "rider",
  as: unknown
): "buyer" | "seller" | "rider" {
  if (accountRole === "rider") return "rider";
  if (accountRole === "buyer" || accountRole === "seller") return accountRole;
  if (as === "seller" || as === "buyer") return as;
  return "buyer";
}

type LeanItem = { sellerId: mongoose.Types.ObjectId; name: string };
type LeanOrder = {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  items: LeanItem[];
  updatedAt: Date;
  createdAt: Date;
};

type MsgRow = {
  senderId: mongoose.Types.ObjectId;
  senderRole: "buyer" | "seller" | "admin" | "rider";
  text: string;
  createdAt: Date;
};

async function hasSharedOrder(buyerId: mongoose.Types.ObjectId, sellerId: mongoose.Types.ObjectId) {
  const hit = await Order.exists({
    buyerId,
    items: { $elemMatch: { sellerId } },
    status: { $ne: "cancelled" }
  });
  return !!hit;
}

async function listingProductMeta(productId?: string, sellerId?: string) {
  if (!productId || !mongoose.isValidObjectId(productId)) {
    return { productOid: undefined as mongoose.Types.ObjectId | undefined, productName: "" };
  }
  const p = await Product.findById(productId).select("sellerId name").lean();
  if (!p) throw new HttpError(404, "Product not found");
  const sid = (p.sellerId as mongoose.Types.ObjectId).toString();
  if (sellerId && sid !== sellerId) throw new HttpError(400, "That product is not sold by this vendor");
  return {
    productOid: new mongoose.Types.ObjectId(productId),
    productName: String(p.name || "").trim().slice(0, 160)
  };
}

type ThreadRow = {
  peerUserId: string;
  peerDisplayName: string;
  itemSummary: string;
  updatedAt: Date;
  messages: Array<{
    senderRole: "buyer" | "seller" | "admin" | "rider";
    text: string;
    createdAt: Date;
    senderLabel: string;
  }>;
  isSupport?: boolean;
  peerRole?: "buyer" | "seller" | "rider" | "admin";
  kind?: string;
};

function mapConvMessages(
  raw: MsgRow[],
  viewer: "buyer" | "seller" | "rider",
  peerLabel: string
): ThreadRow["messages"] {
  return raw.map((m) => {
    const mine =
      (viewer === "buyer" && m.senderRole === "buyer") ||
      (viewer === "seller" && m.senderRole === "seller") ||
      (viewer === "rider" && m.senderRole === "rider");
    return {
      senderRole: m.senderRole,
      text: redactContactSharingInText(m.text),
      createdAt: m.createdAt,
      senderLabel: mine
        ? "You"
        : m.senderRole === "admin"
          ? "Support"
          : m.senderRole === "rider"
            ? peerLabel || "Rider"
            : m.senderRole === "seller"
              ? peerLabel || "Vendor"
              : peerLabel || "Buyer"
    };
  });
}

function listingItemSummary(conv: { listingProductName?: string; productId?: unknown }) {
  const name = String(conv.listingProductName || "").trim();
  if (name) return `About: ${name}`;
  return "Question about a listing";
}

async function displayNameMap(ids: mongoose.Types.ObjectId[]) {
  const uniq = [...new Set(ids.map((id) => id.toString()))].map((s) => new mongoose.Types.ObjectId(s));
  if (!uniq.length) return new Map<string, string>();
  const users = await User.find({ _id: { $in: uniq } })
    .select("displayName email role")
    .lean();
  return new Map(
    users.map((u) => {
      const label = ((u as { displayName?: string; email?: string }).displayName || "").trim();
      const email = ((u as { displayName?: string; email?: string }).email || "").trim();
      return [u._id.toString(), label || email || "User"];
    })
  );
}

function sortMessagesAsc(messages: MsgRow[]) {
  return [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function latestOrderSnippetForPair(orders: LeanOrder[], buyerId: string, sellerId: string): { itemSummary: string; touch: Date } {
  const relevant = orders.filter((o) => {
    if (!o.buyerId || o.buyerId.toString() !== buyerId) return false;
    return (o.items || []).some((it) => it.sellerId.toString() === sellerId);
  });
  if (!relevant.length) return { itemSummary: "", touch: new Date(0) };
  relevant.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const o = relevant[0];
  const touch = new Date(o.updatedAt || o.createdAt);
  const lines = (o.items || []).filter((it) => it.sellerId.toString() === sellerId);
  const itemSummary = lines
    .slice(0, 4)
    .map((it) => it.name)
    .join(" · ");
  return { itemSummary, touch };
}

async function buildSupportThread(uid: mongoose.Types.ObjectId, viewerRole: "buyer" | "seller" | "rider"): Promise<ThreadRow | null> {
  const supportId = await getPrimarySupportAdminId();
  if (!supportId || supportId.equals(uid)) return null;
  const sconv = await Conversation.findOne({ buyerId: uid, sellerId: supportId, kind: "support" }).lean();
  const rawS = sortMessagesAsc((sconv?.messages as MsgRow[]) || []);
  const sMessages = rawS.map((m) => ({
    senderRole: m.senderRole,
    text: m.text,
    createdAt: m.createdAt,
    senderLabel: m.senderId.toString() === uid.toString() ? "You" : "Support"
  }));
  const convTouchS = sconv?.updatedAt ? new Date(sconv.updatedAt).getTime() : 0;
  return {
    peerUserId: supportId.toString(),
    peerDisplayName: DEFAULT_SUPPORT_LABEL,
    itemSummary:
      viewerRole === "seller"
        ? "Account help, payouts, safety"
        : viewerRole === "rider"
          ? "Delivery help, assignments, safety"
          : "Account help, orders, safety",
    updatedAt: new Date(convTouchS || 0),
    messages: sMessages,
    isSupport: true,
    peerRole: "admin",
    kind: "support"
  };
}

async function listRiderThreads(uid: mongoose.Types.ObjectId): Promise<ThreadRow[]> {
  const links = await loadRiderDeliveryLinks(uid);
  const peerIds = [...new Set([...links.buyerIds, ...links.sellerIds])].map((s) => new mongoose.Types.ObjectId(s));
  const names = await displayNameMap(peerIds);

  const buyerConvs = links.buyerIds.length
    ? await Conversation.find({
        buyerId: { $in: links.buyerIds.map((s) => new mongoose.Types.ObjectId(s)) },
        sellerId: uid,
        kind: "delivery"
      }).lean()
    : [];
  const sellerConvs = links.sellerIds.length
    ? await Conversation.find({
        buyerId: uid,
        sellerId: { $in: links.sellerIds.map((s) => new mongoose.Types.ObjectId(s)) },
        kind: "delivery"
      }).lean()
    : [];

  const convByBuyer = new Map(buyerConvs.map((c) => [c.buyerId.toString(), c]));
  const convBySeller = new Map(sellerConvs.map((c) => [c.sellerId.toString(), c]));

  const threads: ThreadRow[] = [];

  for (const bid of links.buyerIds) {
    const conv = convByBuyer.get(bid);
    const raw = sortMessagesAsc((conv?.messages as MsgRow[]) || []);
    const peerLabel = names.get(bid) || "Customer";
    const convTouch = conv?.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
    threads.push({
      peerUserId: bid,
      peerDisplayName: peerLabel,
      itemSummary: "Delivery customer",
      updatedAt: new Date(convTouch || 0),
      messages: mapConvMessages(raw, "rider", peerLabel),
      peerRole: "buyer",
      kind: "delivery"
    });
  }

  for (const sid of links.sellerIds) {
    const conv = convBySeller.get(sid);
    const raw = sortMessagesAsc((conv?.messages as MsgRow[]) || []);
    const peerLabel = names.get(sid) || "Vendor";
    const convTouch = conv?.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
    threads.push({
      peerUserId: sid,
      peerDisplayName: peerLabel,
      itemSummary: "Delivery vendor",
      updatedAt: new Date(convTouch || 0),
      messages: mapConvMessages(raw, "rider", peerLabel),
      peerRole: "seller",
      kind: "delivery"
    });
  }

  threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const support = await buildSupportThread(uid, "rider");
  if (support) threads.unshift(support);
  return threads;
}

/** One thread per peer for orders; listing threads for pre-order questions; support row uses `isSupport`. */
export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const accountRole = req.user!.role;
  if (accountRole !== "buyer" && accountRole !== "seller" && accountRole !== "admin" && accountRole !== "rider") {
    throw new HttpError(403, "Messages are only available for buyer, seller, or rider accounts");
  }
  const role = resolveMsgInbox(accountRole, (req.query as { as?: "buyer" | "seller" }).as);
  const uid = new mongoose.Types.ObjectId(req.user!.id);

  if (role === "rider") {
    const threads = await listRiderThreads(uid);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    return res.json({ threads });
  }

  if (role === "buyer") {
    const orders = (await Order.find({ buyerId: uid, status: { $ne: "cancelled" } })
      .select("buyerId items updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean()) as unknown as LeanOrder[];

    const sellerIds = new Set<string>();

    for (const o of orders) {
      for (const it of o.items || []) {
        if (it.sellerId) {
          sellerIds.add(it.sellerId.toString());
        }
      }
    }
    const sidList = [...sellerIds].map((s) => new mongoose.Types.ObjectId(s));
    const names = await displayNameMap(sidList);
    const convs = await Conversation.find({ buyerId: uid, sellerId: { $in: sidList }, kind: "order" }).lean();
    const convBySeller = new Map(convs.map((c) => [c.sellerId.toString(), c]));

    const orderSellerKeys = new Set(sidList.map((s) => s.toString()));
    const threads: ThreadRow[] = sidList.map((sellerId) => {
      const sid = sellerId.toString();
      const conv = convBySeller.get(sid);
      const { itemSummary, touch } = latestOrderSnippetForPair(orders, uid.toString(), sid);
      const raw = sortMessagesAsc((conv?.messages as MsgRow[]) || []);
      const peerLabel = names.get(sid) || "Seller";
      const messages = mapConvMessages(raw, "buyer", peerLabel);
      const convTouch = conv?.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
      const updatedAt = new Date(Math.max(convTouch, touch.getTime()));
      return {
        peerUserId: sid,
        peerDisplayName: peerLabel,
        itemSummary,
        updatedAt,
        messages,
        peerRole: "seller" as const,
        kind: "order"
      };
    });

    const listingConvs = await Conversation.find({ buyerId: uid, kind: "listing" }).lean();
    const listingOnly = listingConvs.filter((c) => !orderSellerKeys.has(c.sellerId.toString()));
    if (listingOnly.length) {
      const extraIds = listingOnly.map((c) => c.sellerId);
      const extraNames = await displayNameMap(extraIds);
      for (const conv of listingOnly) {
        const sid = conv.sellerId.toString();
        const raw = sortMessagesAsc((conv.messages as MsgRow[]) || []);
        const peerLabel = extraNames.get(sid) || "Seller";
        const convTouch = conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
        threads.push({
          peerUserId: sid,
          peerDisplayName: peerLabel,
          itemSummary: listingItemSummary(conv),
          updatedAt: new Date(convTouch),
          messages: mapConvMessages(raw, "buyer", peerLabel),
          peerRole: "seller",
          kind: "listing"
        });
      }
    }

    const riderIds = await loadBuyerDeliveryRiders(uid);
    if (riderIds.length) {
      const riderOids = riderIds.map((s) => new mongoose.Types.ObjectId(s));
      const riderNames = await displayNameMap(riderOids);
      const riderConvs = await Conversation.find({
        buyerId: uid,
        sellerId: { $in: riderOids },
        kind: "delivery"
      }).lean();
      const convByRider = new Map(riderConvs.map((c) => [c.sellerId.toString(), c]));
      for (const rid of riderIds) {
        if (orderSellerKeys.has(rid)) continue;
        const conv = convByRider.get(rid);
        const raw = sortMessagesAsc((conv?.messages as MsgRow[]) || []);
        const peerLabel = riderNames.get(rid) || "Rider";
        const convTouch = conv?.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
        threads.push({
          peerUserId: rid,
          peerDisplayName: peerLabel,
          itemSummary: "Your delivery rider",
          updatedAt: new Date(convTouch || 0),
          messages: mapConvMessages(raw, "buyer", peerLabel),
          peerRole: "rider",
          kind: "delivery"
        });
      }
    }

    threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const buyerThreads: ThreadRow[] = [...threads];
    const support = await buildSupportThread(uid, "buyer");
    if (support) buyerThreads.unshift(support);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    return res.json({ threads: buyerThreads });
  }

  /** seller */
  const orders = (await Order.find({ "items.sellerId": uid, status: { $ne: "cancelled" } })
    .select("buyerId items updatedAt createdAt")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean()) as unknown as LeanOrder[];

  const buyerIds = new Set<string>();
  for (const o of orders) {
    if (o.buyerId) {
      buyerIds.add(o.buyerId.toString());
    }
  }
  const bidList = [...buyerIds].map((s) => new mongoose.Types.ObjectId(s));
  const names = await displayNameMap(bidList);
  const convs = await Conversation.find({ sellerId: uid, buyerId: { $in: bidList }, kind: "order" }).lean();
  const convByBuyer = new Map(convs.map((c) => [c.buyerId.toString(), c]));

  const orderBuyerKeys = new Set(bidList.map((b) => b.toString()));
  const threads: ThreadRow[] = bidList.map((buyerId) => {
    const bid = buyerId.toString();
    const conv = convByBuyer.get(bid);
    const { itemSummary, touch } = latestOrderSnippetForPair(orders, bid, uid.toString());
    const raw = sortMessagesAsc((conv?.messages as MsgRow[]) || []);
    const peerLabel = names.get(bid) || "Buyer";
    const messages = mapConvMessages(raw, "seller", peerLabel);
    const convTouch = conv?.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
    const updatedAt = new Date(Math.max(convTouch, touch.getTime()));
    return {
      peerUserId: bid,
      peerDisplayName: peerLabel,
      itemSummary,
      updatedAt,
      messages,
      peerRole: "buyer" as const,
      kind: "order"
    };
  });

  const listingConvsSeller = await Conversation.find({ sellerId: uid, kind: "listing" }).lean();
  const listingBuyersOnly = listingConvsSeller.filter((c) => !orderBuyerKeys.has(c.buyerId.toString()));
  if (listingBuyersOnly.length) {
    const extraIds = listingBuyersOnly.map((c) => c.buyerId);
    const extraNames = await displayNameMap(extraIds);
    for (const conv of listingBuyersOnly) {
      const bid = conv.buyerId.toString();
      const raw = sortMessagesAsc((conv.messages as MsgRow[]) || []);
      const peerLabel = extraNames.get(bid) || "Buyer";
      const convTouch = conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
      threads.push({
        peerUserId: bid,
        peerDisplayName: peerLabel,
        itemSummary: listingItemSummary(conv),
        updatedAt: new Date(convTouch),
        messages: mapConvMessages(raw, "seller", peerLabel),
        peerRole: "buyer",
        kind: "listing"
      });
    }
  }

  const riderIds = await loadSellerDeliveryRiders(uid);
  if (riderIds.length) {
    const riderOids = riderIds.map((s) => new mongoose.Types.ObjectId(s));
    const riderNames = await displayNameMap(riderOids);
    const riderConvs = await Conversation.find({
      buyerId: { $in: riderOids },
      sellerId: uid,
      kind: "delivery"
    }).lean();
    const convByRider = new Map(riderConvs.map((c) => [c.buyerId.toString(), c]));
    for (const rid of riderIds) {
      if (orderBuyerKeys.has(rid)) continue;
      const conv = convByRider.get(rid);
      const raw = sortMessagesAsc((conv?.messages as MsgRow[]) || []);
      const peerLabel = riderNames.get(rid) || "Rider";
      const convTouch = conv?.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
      threads.push({
        peerUserId: rid,
        peerDisplayName: peerLabel,
        itemSummary: "Assigned delivery rider",
        updatedAt: new Date(convTouch || 0),
        messages: mapConvMessages(raw, "seller", peerLabel),
        peerRole: "rider",
        kind: "delivery"
      });
    }
  }

  threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const sellerThreads: ThreadRow[] = [...threads];
  const support = await buildSupportThread(uid, "seller");
  if (support) sellerThreads.unshift(support);

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ threads: sellerThreads });
});

export const addMessageByPeer = asyncHandler(async (req: Request, res: Response) => {
  const { peerUserId } = req.params;
  const { text, context, productId: bodyProductId } = req.body as {
    text: string;
    context?: "listing" | "order";
    productId?: string;
  };
  const accountRole = req.user!.role;
  if (accountRole !== "buyer" && accountRole !== "seller" && accountRole !== "admin" && accountRole !== "rider") {
    throw new HttpError(403, "Only buyers, sellers, and riders can send messages");
  }
  const role = resolveMsgInbox(accountRole, (req.query as { as?: "buyer" | "seller" }).as);
  if (!mongoose.isValidObjectId(peerUserId)) throw new HttpError(400, "Invalid peer user id");
  const peerOid = new mongoose.Types.ObjectId(peerUserId);
  const myOid = new mongoose.Types.ObjectId(req.user!.id);
  if (peerOid.equals(myOid)) throw new HttpError(400, "Invalid peer");

  const supportId = await getPrimarySupportAdminId();

  const trimmedText = String(text).trim();
  assertNoContactSharing(trimmedText);

  if (supportId && peerOid.equals(supportId)) {
    const buyerId = myOid;
    const sellerId = supportId;
    const senderRole: "buyer" | "seller" | "rider" =
      accountRole === "seller" ? "seller" : accountRole === "rider" ? "rider" : "buyer";

    let conv = await Conversation.findOne({
      buyerId,
      sellerId,
      kind: "support"
    });

    if (!conv) {
      conv = await Conversation.create({
        buyerId,
        sellerId,
        kind: "support",
        messages: []
      });
    }

    conv.messages.push({
      senderId: myOid,
      senderRole,
      text: trimmedText,
      createdAt: new Date()
    });

    await conv.save();

    fireNotification(supportId, {
      type: "message_received",
      title: "Support message",
      message: "Someone sent a message to SHOPIQGH support.",
      orderId: undefined
    });

    const raw = sortMessagesAsc(conv.messages as MsgRow[]);

    const messages = raw.map((m) => ({
      senderRole: m.senderRole,
      text: m.text,
      createdAt: m.createdAt,
      senderLabel: m.senderId.toString() === myOid.toString() ? "You" : "Support"
    }));

    res.json({
      conversation: {
        peerUserId: supportId.toString(),
        peerDisplayName: DEFAULT_SUPPORT_LABEL,
        updatedAt: conv.updatedAt,
        messages,
        kind: "support"
      }
    });

    return;
  }

  const peerUser = await User.findById(peerOid).select("role displayName email").lean();
  if (!peerUser) throw new HttpError(404, "User not found");
  const peerRole = String((peerUser as { role?: string }).role || "");

  /** Delivery chats: rider ↔ buyer or rider ↔ vendor */
  if (role === "rider" || peerRole === "rider") {
    let buyerId: mongoose.Types.ObjectId;
    let sellerId: mongoose.Types.ObjectId;
    let senderRole: "buyer" | "seller" | "rider";
    let notifyPeer = peerOid;

    if (role === "rider" && peerRole === "buyer") {
      const ok = await riderSharesOrderWithBuyer(myOid.toString(), peerOid.toString());
      if (!ok) throw new HttpError(403, "You can only message customers on your assigned deliveries");
      buyerId = peerOid;
      sellerId = myOid;
      senderRole = "rider";
    } else if (role === "rider" && peerRole === "seller") {
      const ok = await riderSharesOrderWithSeller(myOid.toString(), peerOid.toString());
      if (!ok) throw new HttpError(403, "You can only message vendors on your assigned deliveries");
      buyerId = myOid;
      sellerId = peerOid;
      senderRole = "rider";
    } else if (role === "buyer" && peerRole === "rider") {
      const ok = await riderSharesOrderWithBuyer(peerOid.toString(), myOid.toString());
      if (!ok) throw new HttpError(403, "You can only message the rider assigned to your order");
      buyerId = myOid;
      sellerId = peerOid;
      senderRole = "buyer";
    } else if (role === "seller" && peerRole === "rider") {
      const ok = await riderSharesOrderWithSeller(peerOid.toString(), myOid.toString());
      if (!ok) throw new HttpError(403, "You can only message riders assigned to your orders");
      buyerId = peerOid;
      sellerId = myOid;
      senderRole = "seller";
    } else {
      throw new HttpError(403, "Invalid delivery chat participants");
    }

    let conv = await Conversation.findOne({ buyerId, sellerId, kind: "delivery" });
    if (!conv) {
      conv = await Conversation.create({ buyerId, sellerId, kind: "delivery", messages: [] });
    }

    conv.messages.push({
      senderId: myOid,
      senderRole,
      text: trimmedText,
      createdAt: new Date()
    });
    await conv.save();

    const previewRaw = trimmedText;
    const preview = previewRaw.length > 160 ? `${previewRaw.slice(0, 160)}…` : previewRaw;
    fireNotification(notifyPeer, {
      type: "message_received",
      title: "Delivery message",
      message: preview || "You have a new delivery message.",
      orderId: undefined
    });

    const peerLabel =
      String((peerUser as { displayName?: string }).displayName || "").trim() ||
      String((peerUser as { email?: string }).email || "").trim() ||
      "User";

    const raw = sortMessagesAsc(conv.messages as MsgRow[]);
    const viewer = role === "rider" ? "rider" : role === "seller" ? "seller" : "buyer";
    const messages = mapConvMessages(raw, viewer, peerLabel);

    res.json({
      conversation: {
        peerUserId: peerOid.toString(),
        peerDisplayName: peerLabel,
        updatedAt: conv.updatedAt,
        messages,
        kind: "delivery",
        peerRole
      }
    });
    return;
  }

  let buyerId: mongoose.Types.ObjectId;
  let sellerId: mongoose.Types.ObjectId;
  let senderRole: "buyer" | "seller";
  if (role === "buyer") {
    buyerId = myOid;
    sellerId = peerOid;
    senderRole = "buyer";
  } else {
    buyerId = peerOid;
    sellerId = myOid;
    senderRole = "seller";
  }

  const sharedOrder = await hasSharedOrder(buyerId, sellerId);
  const existingListing = await Conversation.findOne({ buyerId, sellerId, kind: "listing" });

  let convKind: "order" | "listing" = "order";
  if (existingListing && context !== "order") {
    convKind = "listing";
  } else if (context === "listing" || bodyProductId) {
    convKind = "listing";
  } else if (sharedOrder) {
    convKind = "order";
  } else if (role === "buyer") {
    convKind = "listing";
  } else {
    throw new HttpError(403, "You can only message buyers who have contacted you about a listing or order");
  }

  let conv = await Conversation.findOne({ buyerId, sellerId, kind: convKind });
  if (!conv) {
    const createPayload: Record<string, unknown> = { buyerId, sellerId, kind: convKind, messages: [] };
    if (convKind === "listing" && role === "buyer") {
      const { productOid, productName } = await listingProductMeta(bodyProductId, sellerId.toString());
      if (productOid) {
        createPayload.productId = productOid;
        createPayload.listingProductName = productName;
      }
    }
    conv = await Conversation.create(createPayload);
  } else if (convKind === "listing" && bodyProductId && !conv.productId) {
    const { productOid, productName } = await listingProductMeta(bodyProductId, sellerId.toString());
    if (productOid) {
      conv.productId = productOid;
      conv.listingProductName = productName;
    }
  }

  conv.messages.push({
    senderId: myOid,
    senderRole,
    text: trimmedText,
    createdAt: new Date()
  });
  await conv.save();

  const previewRaw = trimmedText;
  const preview = previewRaw.length > 160 ? `${previewRaw.slice(0, 160)}…` : previewRaw;
  fireNotification(peerOid, {
    type: "message_received",
    title: convKind === "listing" ? "Listing question" : "New message",
    message: preview || "You have a new direct message.",
    orderId: undefined
  });

  const [peer] = await User.find({ _id: peerOid }).select("displayName email").lean();
  const peerLabel =
    ((peer as { displayName?: string; email?: string } | null)?.displayName || "").trim() ||
    ((peer as { displayName?: string; email?: string } | null)?.email || "").trim() ||
    "User";

  const raw = sortMessagesAsc(conv.messages as MsgRow[]);
  const messages = mapConvMessages(raw, role, peerLabel);

  res.json({
    conversation: {
      peerUserId: peerOid.toString(),
      peerDisplayName: peerLabel,
      updatedAt: conv.updatedAt,
      messages,
      kind: convKind
    }
  });
});

/** Buyer opens (or resumes) a pre-order chat with a seller from a product listing. */
export const openListingConversation = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== "buyer") {
    throw new HttpError(403, "Only buyers can start a listing conversation");
  }
  const { peerUserId } = req.params;
  if (!mongoose.isValidObjectId(peerUserId)) throw new HttpError(400, "Invalid seller id");
  const sellerOid = new mongoose.Types.ObjectId(peerUserId);
  const buyerOid = new mongoose.Types.ObjectId(req.user!.id);
  if (sellerOid.equals(buyerOid)) throw new HttpError(400, "Invalid seller");

  const seller = await User.findById(sellerOid).select("role displayName email").lean();
  if (!seller || (seller as { role?: string }).role !== "seller") {
    throw new HttpError(404, "Seller not found");
  }

  const body = req.body as { productId?: string };
  const { productOid, productName } = await listingProductMeta(body?.productId, sellerOid.toString());

  let conv = await Conversation.findOne({ buyerId: buyerOid, sellerId: sellerOid, kind: "listing" });
  if (!conv) {
    conv = await Conversation.create({
      buyerId: buyerOid,
      sellerId: sellerOid,
      kind: "listing",
      ...(productOid ? { productId: productOid, listingProductName: productName } : {}),
      messages: []
    });
  } else if (productOid && !conv.productId) {
    conv.productId = productOid;
    conv.listingProductName = productName;
    await conv.save();
  }

  const peerLabel =
    String((seller as { displayName?: string }).displayName || "").trim() ||
    String((seller as { email?: string }).email || "").trim() ||
    "Seller";
  const raw = sortMessagesAsc(conv.messages as MsgRow[]);

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    thread: {
      peerUserId: sellerOid.toString(),
      peerDisplayName: peerLabel,
      itemSummary: listingItemSummary(conv),
      updatedAt: conv.updatedAt,
      messages: mapConvMessages(raw, "buyer", peerLabel),
      kind: "listing"
    }
  });
});

export const getSupportPeer = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user!.role;

  if (role !== "buyer" && role !== "seller" && role !== "rider") {
    throw new HttpError(403, "Support messaging is only for buyers, sellers, and riders.");
  }

  const id = await getPrimarySupportAdminId();

  if (!id) {
    throw new HttpError(503, "Support is not available yet. Configure an admin account.");
  }

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

  res.json({
    supportUserId: id.toString(),
    label: DEFAULT_SUPPORT_LABEL
  });
});
