import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { orderStatusUpdateSchema } from "../orders/order.schemas";
import { paystackPayoutAccountSchema, vendorAnalyticsEventBodySchema } from "./vendor.schemas";
import {
  confirmVendorPaymentReceived,
  getPaystackGhanaBanks,
  listVendorOrders,
  listVendorReviews,
  recordVendorAnalyticsEvent,
  registerPaystackPayoutAccount,
  updateVendorOrderStatus,
  vendorAnalytics,
  deleteVendorOrder
} from "./vendor.controller";

const router = Router();

router.get("/paystack/ghana-banks", protect, requireActiveAccount, authorize("seller", "admin"), getPaystackGhanaBanks);
router.post(
  "/paystack/payout-account",
  protect,
  requireActiveAccount,
  authorize("seller"),
  validateBody(paystackPayoutAccountSchema),
  registerPaystackPayoutAccount
);

router.get("/orders", protect, requireActiveAccount, authorize("seller", "admin"), listVendorOrders);
router.post(
  "/orders/:orderId/confirm-payment-received",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  confirmVendorPaymentReceived
);
router.patch(
  "/orders/:orderId/status",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  validateBody(orderStatusUpdateSchema),
  updateVendorOrderStatus
);
router.delete(
  "/orders/:orderId",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  deleteVendorOrder
);
router.post(
  "/analytics/events",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  validateBody(vendorAnalyticsEventBodySchema),
  recordVendorAnalyticsEvent
);
router.get("/analytics", protect, requireActiveAccount, authorize("seller", "admin"), vendorAnalytics);
router.get("/reviews", protect, requireActiveAccount, authorize("seller", "admin"), listVendorReviews);

export default router;
