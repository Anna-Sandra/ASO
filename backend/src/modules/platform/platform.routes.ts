import { Router } from "express";
import { getPublicPlatformConfig } from "./platform.controller";

const router = Router();
router.get("/config", getPublicPlatformConfig);

export default router;
