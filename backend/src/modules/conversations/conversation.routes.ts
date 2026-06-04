import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody, validateQuery } from "../../middleware/validate";
import { conversationInboxQuerySchema } from "../../schemas/commonQuery";
import { addMessageByPeer, getSupportPeer, listConversations, openListingConversation } from "./conversation.controller";
import { conversationMessageSchema, openListingConversationSchema } from "./conversation.schemas";

const router = Router();

router.get("/support-peer", protect, requireActiveAccount, authorize("buyer", "seller"), getSupportPeer);
router.get(
  "/",
  protect,
  requireActiveAccount,
  authorize("buyer", "seller", "admin"),
  validateQuery(conversationInboxQuerySchema),
  listConversations
);
router.post(
  "/by-peer/:peerUserId/messages",
  protect,
  requireActiveAccount,
  authorize("buyer", "seller", "admin"),
  validateBody(conversationMessageSchema),
  addMessageByPeer
);
router.post(
  "/by-peer/:peerUserId/open-listing",
  protect,
  requireActiveAccount,
  authorize("buyer"),
  validateBody(openListingConversationSchema),
  openListingConversation
);

export default router;
