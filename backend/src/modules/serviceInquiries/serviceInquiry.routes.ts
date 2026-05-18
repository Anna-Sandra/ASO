import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import {
  createServiceInquiry,
  getOfflineInquiriesEligible,
  listMyServiceInquiries,
  listSellerServiceInquiries,
  patchServiceInquiry
} from "./serviceInquiry.controller";
import { createServiceInquirySchema, patchServiceInquirySchema } from "./serviceInquiry.schemas";

const router = Router();

router.post(
  "/",
  protect,
  requireActiveAccount,
  authorize("buyer"),
  validateBody(createServiceInquirySchema),
  createServiceInquiry
);
router.get("/mine", protect, requireActiveAccount, authorize("buyer"), listMyServiceInquiries);
router.get(
  "/seller/eligible",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  getOfflineInquiriesEligible
);
router.get("/seller", protect, requireActiveAccount, authorize("seller"), listSellerServiceInquiries);
router.patch(
  "/:id",
  protect,
  requireActiveAccount,
  authorize("seller"),
  validateBody(patchServiceInquirySchema),
  patchServiceInquiry
);

export default router;
