import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { addMessageByPeer, getSupportPeer, listConversations } from "./conversation.controller";
import { conversationMessageSchema } from "./conversation.schemas";

const router = Router();

router.get("/support-peer", protect, requireActiveAccount, authorize("buyer", "seller"), getSupportPeer);
router.get("/", protect, requireActiveAccount, authorize("buyer", "seller", "admin"), listConversations);
router.post(
  "/by-peer/:peerUserId/messages",
  protect,
  requireActiveAccount,
  authorize("buyer", "seller", "admin"),
  validateBody(conversationMessageSchema),
  addMessageByPeer
);

export default router;
