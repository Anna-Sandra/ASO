import type { Request, Response } from "express";
import mongoose from "mongoose";
import { DEFAULT_SUPPORT_LABEL } from "../../config/brand";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";
import { Order } from "../orders/order.model";
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

/** One thread per (buyerId, sellerId) for orders; support row uses `isSupport`. */
export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  type ThreadRow = {
    peerUserId: string;
    peerDisplayName: string;
    itemSummary: string;
    updatedAt: Date;
    messages: Array<{ senderRole: "buyer" | "seller" | "admin"; text: string; createdAt: Date; senderLabel: string }>;
    isSupport?: boolean;
  };
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

    const threads: ThreadRow[] = sidList.map((sellerId) => {
      const sid = sellerId.toString();
      const conv = convBySeller.get(sid);
      const { itemSummary, touch } = latestOrderSnippetForPair(orders, uid.toString(), sid);
      const raw = sortMessagesAsc((conv?.messages as MsgRow[]) || []);
      const peerLabel = names.get(sid) || "Seller";
      const messages = raw.map((m) => ({
        senderRole: m.senderRole,
        text: m.text,
        createdAt: m.createdAt,
        senderLabel: m.senderRole === "buyer" ? "You" : peerLabel
      }));
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

  const threads: ThreadRow[] = bidList.map((buyerId) => {
    const bid = buyerId.toString();
    const conv = convByBuyer.get(bid);
    const { itemSummary, touch } = latestOrderSnippetForPair(orders, bid, uid.toString());
    const raw = sortMessagesAsc((conv?.messages as MsgRow[]) || []);
    const peerLabel = names.get(bid) || "Buyer";
    const messages = raw.map((m) => ({
      senderRole: m.senderRole,
      text: m.text,
      createdAt: m.createdAt,
      senderLabel: m.senderRole === "seller" ? "You" : peerLabel
    }));
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
  const { text } = req.body as { text: string };
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

  if (!(await hasSharedOrder(buyerId, sellerId))) {
    throw new HttpError(403, "You can only message people you share an active order with");
  }

  let conv = await Conversation.findOne({ buyerId, sellerId, kind: "order" });
  if (!conv) {
    conv = await Conversation.create({ buyerId, sellerId, kind: "order", messages: [] });
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
    title: "New message",
    message: preview || "You have a new direct message.",
    orderId: undefined
  });

  const [peer] = await User.find({ _id: peerOid }).select("displayName email").lean();
  const peerLabel =
    ((peer as { displayName?: string; email?: string } | null)?.displayName || "").trim() ||
    ((peer as { displayName?: string; email?: string } | null)?.email || "").trim() ||
    "User";

  const raw = sortMessagesAsc(conv.messages as MsgRow[]);
  const messages = raw.map((m) => ({
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

  res.json({
    conversation: {
      peerUserId: peerOid.toString(),
      peerDisplayName: peerLabel,
      updatedAt: conv.updatedAt,
      messages
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
