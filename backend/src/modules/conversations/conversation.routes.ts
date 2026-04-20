import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { addMessageByPeer, listConversations } from "./conversation.controller";
import { conversationMessageSchema } from "./conversation.schemas";

const router = Router();

router.get("/", protect, authorize("buyer", "seller"), listConversations);
router.post(
  "/by-peer/:peerUserId/messages",
  protect,
  authorize("buyer", "seller"),
  validateBody(conversationMessageSchema),
  addMessageByPeer
);

export default router;
