import { Router } from "express";
import { getPublicCouponsCatalog, getPublicDealsCatalog } from "./promotion.controller";

const router = Router();

router.get("/deals-catalog", getPublicDealsCatalog);
router.get("/coupons-catalog", getPublicCouponsCatalog);

export default router;
