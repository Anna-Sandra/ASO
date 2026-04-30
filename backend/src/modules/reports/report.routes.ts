import { Router } from "express";
import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody, validateQuery } from "../../middleware/validate";
import { createReport, listMyReports } from "./report.controller";
import { createReportSchema, myReportsQuerySchema } from "./report.schemas";

const router = Router();

/** Authenticated: list reports filed by the current user. Also exposed at GET /me (legacy / alternate clients). */
router.get("/", protect, requireActiveAccount, validateQuery(myReportsQuerySchema), listMyReports);
router.get("/me", protect, requireActiveAccount, validateQuery(myReportsQuerySchema), listMyReports);
router.post("/", protect, requireActiveAccount, validateBody(createReportSchema), createReport);

export default router;
