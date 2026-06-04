import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Notification } from "./notification.model";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";

export const getNotificationSummary = asyncHandler(async (req: Request, res: Response) => {
  const uid = new mongoose.Types.ObjectId(req.user!.id);
  const unreadCount = await Notification.countDocuments({ userId: uid, read: false });
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({ unreadCount });
});

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const unreadOnly = Boolean((req.query as { unread?: boolean }).unread);
  const query: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(req.user!.id) };
  if (unreadOnly) query.read = false;

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.json({
    notifications: notifications.map((n) => ({
      id: (n._id as mongoose.Types.ObjectId).toString(),
      type: n.type,
      title: n.title,
      message: n.message,
      orderId: n.orderId ? (n.orderId as mongoose.Types.ObjectId).toString() : null,
      read: n.read,
      readAt: n.readAt ?? null,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt
    }))
  });
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid notification id");

  const result = await Notification.findOneAndUpdate(
    { _id: id, userId: new mongoose.Types.ObjectId(req.user!.id) },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  ).lean();

  if (!result) throw new HttpError(404, "Notification not found");
  res.json({ ok: true });
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.updateMany(
    { userId: new mongoose.Types.ObjectId(req.user!.id), read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  res.json({ ok: true });
});
