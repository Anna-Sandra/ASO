import { Router } from "express";
import { validateBody } from "../../middleware/validate";
import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { createCheckoutSession } from "./payments.controller";
import { createCheckoutSessionSchema } from "./payments.schemas";

const router = Router();

router.post(
  "/create-checkout-session",
  protect,
  requireActiveAccount,
  validateBody(createCheckoutSessionSchema),
  createCheckoutSession
);

export default router;

