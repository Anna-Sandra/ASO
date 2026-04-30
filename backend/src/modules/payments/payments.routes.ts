import { Router } from "express";
import { validateBody } from "../../middleware/validate";
import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import {
  createCheckoutSession,
  getCheckoutPaymentOptions,
  initPaystackGuide,
  initializePaystackTransaction,
  verifyPaystackByReference,
  verifyPaystackForOrder
} from "./payments.controller";
import {
  createCheckoutSessionSchema,
  paystackInitGuideSchema,
  paystackInitializeSchema,
  paystackVerifyOrderSchema
} from "./payments.schemas";

const router = Router();

router.get("/checkout-options", getCheckoutPaymentOptions);

router.post(
  "/create-checkout-session",
  protect,
  requireActiveAccount,
  validateBody(createCheckoutSessionSchema),
  createCheckoutSession
);

router.post(
  "/paystack/initialize",
  protect,
  requireActiveAccount,
  validateBody(paystackInitializeSchema),
  initializePaystackTransaction
);
/** Guide-style init (same handler as POST /api/paystack/init) — lives under /api/payments so it always registers with the payments router. */
router.post(
  "/paystack/init",
  protect,
  requireActiveAccount,
  validateBody(paystackInitGuideSchema),
  initPaystackGuide
);
router.get(
  "/paystack/verify/:ref",
  protect,
  requireActiveAccount,
  verifyPaystackByReference
);
router.post(
  "/paystack/verify",
  protect,
  requireActiveAccount,
  validateBody(paystackVerifyOrderSchema),
  verifyPaystackForOrder
);

export default router;

