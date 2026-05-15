import { Router } from "express";
import { protect, authorize, optionalProtect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { getMyCourierApplicationStatus, submitCourierApplication } from "./courierApplication.controller";
import { submitCourierApplicationSchema } from "./courierApplication.schemas";

const router = Router();

router.post(
  "/",
  optionalProtect,
  requireActiveAccount,
  validateBody(submitCourierApplicationSchema),
  submitCourierApplication
);

router.get("/me", protect, requireActiveAccount, authorize("buyer"), getMyCourierApplicationStatus);

export default router;
