import { Router } from "express";
import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "./notification.controller";

const router = Router();

router.get("/", protect, requireActiveAccount, getNotifications);
router.post("/read-all", protect, requireActiveAccount, markAllNotificationsRead);
router.post("/:id/read", protect, requireActiveAccount, markNotificationRead);

export default router;
