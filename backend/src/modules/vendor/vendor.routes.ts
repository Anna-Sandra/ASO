import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { orderStatusUpdateSchema } from "../orders/order.schemas";
import { vendorAnalyticsEventBodySchema } from "./vendor.schemas";
import {
  confirmVendorPaymentReceived,
  listVendorOrders,
  listVendorReviews,
  recordVendorAnalyticsEvent,
  updateVendorOrderStatus,
  vendorAnalytics
} from "./vendor.controller";

const router = Router();

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
