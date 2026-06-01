import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { cartSnapshotBodySchema } from "./cart.schemas";
import { upsertCartSnapshot } from "./cart.controller";

const router = Router();

router.put("/snapshot", protect, requireActiveAccount, authorize("buyer"), validateBody(cartSnapshotBodySchema), upsertCartSnapshot);

export default router;
