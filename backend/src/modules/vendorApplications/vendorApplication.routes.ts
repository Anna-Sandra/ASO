import { Router } from "express";
import { protect, authorize, optionalProtect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { getMyVendorApplicationStatus, submitVendorApplication } from "./vendorApplication.controller";
import { submitVendorApplicationSchema } from "./vendorApplication.schemas";

const router = Router();

router.post(
  "/",
  optionalProtect,
  requireActiveAccount,
  validateBody(submitVendorApplicationSchema),
  submitVendorApplication
);

router.get("/me", protect, requireActiveAccount, authorize("buyer"), getMyVendorApplicationStatus);

export default router;
