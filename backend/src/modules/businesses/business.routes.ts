import { Router } from "express";
import { authorize, optionalProtect, protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { requireVendorSubscription } from "../../middleware/requireVendorSubscription";
import { validateBody, validateQuery } from "../../middleware/validate";
import {
  createBusinessReview,
  getBusinessReviewStatus,
  listBusinessReviews
} from "../reviews/businessReview.controller";
import { createReviewSchema } from "../reviews/review.schemas";
import {
  createMenuSection,
  createMyBusiness,
  deleteMenuSection,
  deleteMyBusinessByKey,
  getBusinessByKey,
  getBusinessStorefront,
  linkMyListingsToStore,
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

/** Same as product reviews: logged-in shoppers may rate stores they bought from. */
const shopAccountRoles = ["buyer", "seller", "admin"] as const;

router.get("/", validateQuery(listBusinessesQuerySchema), listPublicBusinesses);
router.get("/mine", protect, requireActiveAccount, authorize("seller", "admin"), listMyBusinesses);
router.post(
  "/",
  protect,
  requireActiveAccount,
  authorize("seller"),
  requireVendorSubscription,
  validateBody(createBusinessSchema),
  createMyBusiness
);
router.get("/:key/storefront", optionalProtect, getBusinessStorefront);
router.get("/:key/reviews", listBusinessReviews);
router.get("/:key/review-status", protect, requireActiveAccount, authorize(...shopAccountRoles), getBusinessReviewStatus);
router.post(
  "/:key/reviews",
  protect,
  requireActiveAccount,
  authorize(...shopAccountRoles),
  validateBody(createReviewSchema),
  createBusinessReview
);
router.post(
  "/:key/link-listings",
  protect,
  requireActiveAccount,
  authorize("seller"),
  requireVendorSubscription,
  linkMyListingsToStore
);
router.get("/:key/menu-sections", protect, requireActiveAccount, authorize("seller", "admin"), listMenuSections);
router.post(
  "/:key/menu-sections",
  protect,
  requireActiveAccount,
  authorize("seller"),
  requireVendorSubscription,
  validateBody(createMenuSectionSchema),
  createMenuSection
);
router.patch(
  "/:key/menu-sections/:sectionId",
  protect,
  requireActiveAccount,
  authorize("seller"),
  requireVendorSubscription,
  validateBody(updateMenuSectionSchema),
  patchMenuSection
);
router.delete(
  "/:key/menu-sections/:sectionId",
  protect,
  requireActiveAccount,
  authorize("seller"),
  requireVendorSubscription,
  deleteMenuSection
);
router.patch(
  "/:key",
  protect,
  requireActiveAccount,
  authorize("seller"),
  requireVendorSubscription,
  validateBody(updateBusinessSchema),
  updateMyBusinessByKey
);
router.delete(
  "/:key",
  protect,
  requireActiveAccount,
  authorize("seller"),
  requireVendorSubscription,
  deleteMyBusinessByKey
);
router.get("/:key", optionalProtect, getBusinessByKey);

export default router;
