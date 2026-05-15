import { Router } from "express";
import { authorize, optionalProtect, protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody, validateQuery } from "../../middleware/validate";
import {
  createMenuSection,
  createMyBusiness,
  deleteMenuSection,
  getBusinessByKey,
  getBusinessStorefront,
  listMenuSections,
  listMyBusinesses,
  listPublicBusinesses,
  patchMenuSection,
  updateMyBusinessByKey
} from "./business.controller";
import {
  createBusinessSchema,
  createMenuSectionSchema,
  listBusinessesQuerySchema,
  updateBusinessSchema,
  updateMenuSectionSchema
} from "./business.schemas";

const router = Router();

router.get("/", validateQuery(listBusinessesQuerySchema), listPublicBusinesses);
router.get("/mine", protect, requireActiveAccount, authorize("seller", "admin"), listMyBusinesses);
router.post("/", protect, requireActiveAccount, authorize("seller"), validateBody(createBusinessSchema), createMyBusiness);
router.get("/:key/storefront", optionalProtect, getBusinessStorefront);
router.get("/:key/menu-sections", protect, requireActiveAccount, authorize("seller", "admin"), listMenuSections);
router.post(
  "/:key/menu-sections",
  protect,
  requireActiveAccount,
  authorize("seller"),
  validateBody(createMenuSectionSchema),
  createMenuSection
);
router.patch(
  "/:key/menu-sections/:sectionId",
  protect,
  requireActiveAccount,
  authorize("seller"),
  validateBody(updateMenuSectionSchema),
  patchMenuSection
);
router.delete(
  "/:key/menu-sections/:sectionId",
  protect,
  requireActiveAccount,
  authorize("seller"),
  deleteMenuSection
);
router.patch(
  "/:key",
  protect,
  requireActiveAccount,
  authorize("seller"),
  validateBody(updateBusinessSchema),
  updateMyBusinessByKey
);
router.get("/:key", optionalProtect, getBusinessByKey);

export default router;
