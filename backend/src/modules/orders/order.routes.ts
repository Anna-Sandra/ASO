import { Router } from "express";
import { protect, authorize, optionalProtect } from "../../middleware/auth";
import { requireAdminEnvSecret } from "../../middleware/adminSecret";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { markAdminOrderPaid } from "../admin/admin.controller";
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

router.post("/checkout", optionalProtect, requireActiveAccount, validateBody(checkoutSchema), checkout);
/** Same handler as POST /api/admin/orders/:id/mark-paid — duplicated here so deployments always pick it up with the orders router. */
router.post(
  "/:id/admin/mark-paid",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  markAdminOrderPaid
);
router.get("/", protect, requireActiveAccount, authorize(...shopRoles), listMyOrders);
router.get("/buyer/vendor-messages", protect, requireActiveAccount, authorize("buyer", "admin"), listBuyerVendorInbox);
router.get("/seller/buyer-messages", protect, requireActiveAccount, authorize("seller", "admin"), listSellerBuyerInbox);
router.get("/:id", optionalProtect, requireActiveAccount, getOrder);
router.post("/:id/messages", protect, requireActiveAccount, authorize(...shopRoles), validateBody(orderMessageSchema), addOrderMessage);
router.post("/:id/pay-manual", optionalProtect, requireActiveAccount, validateBody(orderManualPaymentSchema), markManualPayment);
router.post("/:id/cancel", optionalProtect, requireActiveAccount, validateBody(cancelOrderSchema), cancelMyOrder);
router.delete("/:id", optionalProtect, requireActiveAccount, deleteMyOrder);

export default router;
