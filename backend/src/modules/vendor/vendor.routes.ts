import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
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

router.get("/orders", protect, authorize("seller"), listVendorOrders);
router.post(
  "/orders/:orderId/confirm-payment-received",
  protect,
  authorize("seller"),
  confirmVendorPaymentReceived
);
router.patch("/orders/:orderId/status", protect, authorize("seller"), validateBody(orderStatusUpdateSchema), updateVendorOrderStatus);
router.post("/analytics/events", protect, authorize("seller"), validateBody(vendorAnalyticsEventBodySchema), recordVendorAnalyticsEvent);
router.get("/analytics", protect, authorize("seller"), vendorAnalytics);
router.get("/reviews", protect, authorize("seller"), listVendorReviews);

export default router;
