import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import {
  getVendorSubscriptionStatus,
  initializeVendorSubscription,
  verifyVendorSubscription
} from "./vendorSubscription.controller";
import { vendorSubscriptionVerifyParamsSchema } from "./vendorSubscription.schemas";

const router = Router();

router.get("/status", protect, requireActiveAccount, authorize("seller", "admin"), getVendorSubscriptionStatus);
router.post(
  "/initialize",
  protect,
  requireActiveAccount,
  authorize("seller"),
  initializeVendorSubscription
);
router.get(
  "/verify/:ref",
  protect,
  requireActiveAccount,
  authorize("seller"),
  verifyVendorSubscription
);

export { vendorSubscriptionVerifyParamsSchema };
export default router;
