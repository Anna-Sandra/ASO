import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { getMyCourierApplicationStatus, submitCourierApplication } from "./courierApplication.controller";
import { submitCourierApplicationSchema } from "./courierApplication.schemas";

const router = Router();

router.post(
  "/",
  protect,
  requireActiveAccount,
  authorize("buyer"),
  validateBody(submitCourierApplicationSchema),
  submitCourierApplication
);

router.get("/me", protect, requireActiveAccount, authorize("buyer"), getMyCourierApplicationStatus);

export default router;
