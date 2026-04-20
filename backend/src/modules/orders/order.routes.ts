import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import {
  addOrderMessage,
  checkout,
  getOrder,
  listBuyerVendorInbox,
  listMyOrders,
  listSellerBuyerInbox,
  markManualPayment
} from "./order.controller";
import { checkoutSchema, orderManualPaymentSchema, orderMessageSchema } from "./order.schemas";

const router = Router();

/** buyer + seller shop; admin allowed so support/test accounts can check out (BuyerGate does not block admin). */
const shopRoles = ["buyer", "seller", "admin"] as const;

router.post("/checkout", protect, authorize(...shopRoles), validateBody(checkoutSchema), checkout);
router.get("/", protect, authorize(...shopRoles), listMyOrders);
router.get("/buyer/vendor-messages", protect, authorize("buyer", "admin"), listBuyerVendorInbox);
router.get("/seller/buyer-messages", protect, authorize("seller", "admin"), listSellerBuyerInbox);
router.get("/:id", protect, getOrder);
router.post("/:id/messages", protect, authorize(...shopRoles), validateBody(orderMessageSchema), addOrderMessage);
router.post("/:id/pay-manual", protect, authorize(...shopRoles), validateBody(orderManualPaymentSchema), markManualPayment);

export default router;
