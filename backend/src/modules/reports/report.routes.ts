import { Router } from "express";
import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { createReport } from "./report.controller";
import { createReportSchema } from "./report.schemas";

const router = Router();

router.post("/", protect, requireActiveAccount, validateBody(createReportSchema), createReport);

export default router;
