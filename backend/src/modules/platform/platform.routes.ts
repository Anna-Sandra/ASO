import { Router } from "express";
import { getPlatformAccessCheck, getPublicPlatformConfig, reverseGeocodePublic } from "./platform.controller";

const router = Router();
router.get("/access-check", getPlatformAccessCheck);
router.get("/config", getPublicPlatformConfig);
router.get("/reverse-geocode", reverseGeocodePublic);

export default router;
