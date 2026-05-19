import { Router } from "express";
import { validateBody } from "../../middleware/validate";
import { optionalProtect, protect } from "../../middleware/auth";
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
  optionalProtect,
  requireActiveAccount,
  validateBody(paystackInitializeSchema),
  initializePaystackTransaction
);
/** Guide-style init (same handler as POST /api/paystack/init) — lives under /api/payments so it always registers with the payments router. */
router.post(
  "/paystack/init",
  optionalProtect,
  requireActiveAccount,
  validateBody(paystackInitGuideSchema),
  initPaystackGuide
);
router.get(
  "/paystack/verify/:ref",
  optionalProtect,
  requireActiveAccount,
  verifyPaystackByReference
);
router.post(
  "/paystack/verify",
  optionalProtect,
  requireActiveAccount,
  validateBody(paystackVerifyOrderSchema),
  verifyPaystackForOrder
);

export default router;

