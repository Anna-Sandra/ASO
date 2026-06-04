import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody, validateQuery } from "../../middleware/validate";
import { daysQuerySchema } from "../../schemas/commonQuery";
import { orderStatusUpdateSchema } from "../orders/order.schemas";
import { paystackPayoutAccountSchema, vendorAnalyticsEventBodySchema } from "./vendor.schemas";
import vendorSubscriptionRoutes from "../vendorSubscription/vendorSubscription.routes";
import {
  createVendorPromotion,
  endVendorPromotion,
  listVendorPromotions
} from "../promotions/promotion.controller";
import { vendorCreatePromotionSchema } from "../promotions/promotion.schemas";
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

router.use("/subscription", vendorSubscriptionRoutes);

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
router.get(
  "/analytics",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  validateQuery(daysQuerySchema),
  vendorAnalytics
);
router.get("/reviews", protect, requireActiveAccount, authorize("seller", "admin"), listVendorReviews);

router.get("/promotions", protect, requireActiveAccount, authorize("seller", "admin"), listVendorPromotions);
router.post(
  "/promotions",
  protect,
  requireActiveAccount,
  authorize("seller"),
  validateBody(vendorCreatePromotionSchema),
  createVendorPromotion
);

router.post(
  "/promotions/:id/end",
  protect,
  requireActiveAccount,
  authorize("seller"),
  endVendorPromotion
);

export default router;
