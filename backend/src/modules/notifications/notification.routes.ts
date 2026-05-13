import { Router } from "express";
import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { getNotificationSummary, getNotifications, markNotificationRead, markAllNotificationsRead } from "./notification.controller";

const router = Router();

router.get("/summary", protect, requireActiveAccount, getNotificationSummary);
router.get("/", protect, requireActiveAccount, getNotifications);
router.post("/read-all", protect, requireActiveAccount, markAllNotificationsRead);
router.post("/:id/read", protect, requireActiveAccount, markNotificationRead);

export default router;
