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

function resolveMsgInbox(
  accountRole: "buyer" | "seller" | "admin",
  as: unknown
): "buyer" | "seller" {
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
  senderRole: "buyer" | "seller" | "admin";
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
  messages: Array<{ senderRole: "buyer" | "seller" | "admin"; text: string; createdAt: Date; senderLabel: string }>;
  isSupport?: boolean;
};

function mapConvMessages(
  raw: MsgRow[],
  role: "buyer" | "seller",
  peerLabel: string
): ThreadRow["messages"] {
  return raw.map((m) => ({
    senderRole: m.senderRole,
    text: m.text,
    createdAt: m.createdAt,
    senderLabel:
      role === "buyer"
        ? m.senderRole === "buyer"
          ? "You"
          : peerLabel
        : m.senderRole === "seller"
          ? "You"
          : peerLabel
  }));
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
    .select("displayName email")
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
    if (o.buyerId.toString() !== buyerId) return false;
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

/** One thread per peer for orders; listing threads for pre-order questions; support row uses `isSupport`. */
export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const accountRole = req.user!.role;
  if (accountRole !== "buyer" && accountRole !== "seller" && accountRole !== "admin") {
    throw new HttpError(403, "Messages are only available for buyer or seller accounts");
  }
  const role = resolveMsgInbox(accountRole, (req.query as { as?: unknown }).as);
  const uid = new mongoose.Types.ObjectId(req.user!.id);

  if (role === "buyer") {
    const orders = (await Order.find({ buyerId: uid, status: { $ne: "cancelled" } })
      .select("buyerId items updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean()) as unknown as LeanOrder[];

    const sellerIds = new Set<string>();
    for (const o of orders) {
      for (const it of o.items || []) {
        sellerIds.add(it.sellerId.toString());
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
        messages
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
          messages: mapConvMessages(raw, "buyer", peerLabel)
        });
      }
    }

    threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const supportIdForBuyer = await getPrimarySupportAdminId();
    const buyerThreads: ThreadRow[] = [...threads];
    if (supportIdForBuyer && !supportIdForBuyer.equals(uid)) {
      const sconv = await Conversation.findOne({ buyerId: uid, sellerId: supportIdForBuyer, kind: "support" }).lean();
      const rawS = sortMessagesAsc((sconv?.messages as MsgRow[]) || []);
      const sMessages = rawS.map((m) => ({
        senderRole: m.senderRole,
        text: m.text,
        createdAt: m.createdAt,
        senderLabel: m.senderRole === "buyer" ? "You" : "Support"
      }));
      const convTouchS = sconv?.updatedAt ? new Date(sconv.updatedAt).getTime() : 0;
      buyerThreads.unshift({
        peerUserId: supportIdForBuyer.toString(),
        peerDisplayName: DEFAULT_SUPPORT_LABEL,
        itemSummary: "Account help, orders, safety",
        updatedAt: new Date(convTouchS || 0),
        messages: sMessages,
        isSupport: true
      });
    }

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
    buyerIds.add(o.buyerId.toString());
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
      messages
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
        messages: mapConvMessages(raw, "seller", peerLabel)
      });
    }
  }

  threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const supportIdForSeller = await getPrimarySupportAdminId();
  const sellerThreads: ThreadRow[] = [...threads];
  if (supportIdForSeller && !supportIdForSeller.equals(uid)) {
    const sconv = await Conversation.findOne({ buyerId: uid, sellerId: supportIdForSeller, kind: "support" }).lean();
    const rawS = sortMessagesAsc((sconv?.messages as MsgRow[]) || []);
    const sMessages = rawS.map((m) => ({
      senderRole: m.senderRole,
      text: m.text,
      createdAt: m.createdAt,
      senderLabel: m.senderRole === "buyer" ? "You" : "Support"
    }));
    const convTouchS = sconv?.updatedAt ? new Date(sconv.updatedAt).getTime() : 0;
    sellerThreads.unshift({
      peerUserId: supportIdForSeller.toString(),
      peerDisplayName: DEFAULT_SUPPORT_LABEL,
      itemSummary: "Account help, payouts, safety",
      updatedAt: new Date(convTouchS || 0),
      messages: sMessages,
      isSupport: true
    });
  }

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
  if (accountRole !== "buyer" && accountRole !== "seller" && accountRole !== "admin") {
    throw new HttpError(403, "Only buyers and sellers can send messages");
  }
  const role = resolveMsgInbox(accountRole, (req.query as { as?: unknown }).as);
  if (!mongoose.isValidObjectId(peerUserId)) throw new HttpError(400, "Invalid peer user id");
  const peerOid = new mongoose.Types.ObjectId(peerUserId);
  const myOid = new mongoose.Types.ObjectId(req.user!.id);
  if (peerOid.equals(myOid)) throw new HttpError(400, "Invalid peer");

  const supportId = await getPrimarySupportAdminId();

  if (supportId && peerOid.equals(supportId)) {
    const buyerId = myOid;
    const sellerId = supportId;
    let conv = await Conversation.findOne({ buyerId, sellerId, kind: "support" });
    if (!conv) conv = await Conversation.create({ buyerId, sellerId, kind: "support", messages: [] });
    conv.messages.push({
      senderId: myOid,
      senderRole: "buyer",
      text: String(text).trim(),
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
      senderLabel: m.senderRole === "buyer" ? "You" : "Support"
    }));
    res.json({
      conversation: {
        peerUserId: supportId.toString(),
        peerDisplayName: DEFAULT_SUPPORT_LABEL,
        updatedAt: conv.updatedAt,
        messages
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
    text: String(text).trim(),
    createdAt: new Date()
  });
  await conv.save();

  const previewRaw = String(text).trim();
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
  if (role !== "buyer" && role !== "seller") {
    throw new HttpError(403, "Support messaging is only for buyers and sellers.");
  }
  const id = await getPrimarySupportAdminId();
  if (!id) throw new HttpError(503, "Support is not available yet. Configure an admin account.");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ supportUserId: id.toString(), label: DEFAULT_SUPPORT_LABEL });
});
