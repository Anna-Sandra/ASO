import { Router } from "express";
import { getPlatformAccessCheck, getPublicPlatformConfig } from "./platform.controller";

const router = Router();
router.get("/access-check", getPlatformAccessCheck);
router.get("/config", getPublicPlatformConfig);

export default router;
