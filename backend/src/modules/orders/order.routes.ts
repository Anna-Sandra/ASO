import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import {
  addOrderMessage,
  cancelMyOrder,
  checkout,
  deleteMyOrder,
  getOrder,
  listBuyerVendorInbox,
  listMyOrders,
  listSellerBuyerInbox,
  markManualPayment
} from "./order.controller";
import { cancelOrderSchema, checkoutSchema, orderManualPaymentSchema, orderMessageSchema } from "./order.schemas";

const router = Router();

/** buyer + seller shop; admin allowed so support/test accounts can check out (BuyerGate does not block admin). */
const shopRoles = ["buyer", "seller", "admin"] as const;

router.post("/checkout", protect, requireActiveAccount, authorize(...shopRoles), validateBody(checkoutSchema), checkout);
router.get("/", protect, requireActiveAccount, authorize(...shopRoles), listMyOrders);
router.get("/buyer/vendor-messages", protect, requireActiveAccount, authorize("buyer", "admin"), listBuyerVendorInbox);
router.get("/seller/buyer-messages", protect, requireActiveAccount, authorize("seller", "admin"), listSellerBuyerInbox);
router.get("/:id", protect, requireActiveAccount, getOrder);
router.post("/:id/messages", protect, requireActiveAccount, authorize(...shopRoles), validateBody(orderMessageSchema), addOrderMessage);
router.post("/:id/pay-manual", protect, requireActiveAccount, authorize(...shopRoles), validateBody(orderManualPaymentSchema), markManualPayment);
router.post("/:id/cancel", protect, requireActiveAccount, authorize(...shopRoles), validateBody(cancelOrderSchema), cancelMyOrder);
router.delete("/:id", protect, requireActiveAccount, authorize(...shopRoles), deleteMyOrder);

export default router;
