import { Router } from "express";
import { protect, authorize, optionalProtect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { requireVendorSubscription } from "../../middleware/requireVendorSubscription";
import { validateBody } from "../../middleware/validate";
import {
  createProduct,
  deleteProduct,
  getProduct,
  getRelatedProducts,
  listMyProducts,
  listProducts,
  smartSearchProducts,
  recordProductView,
  updateProduct
} from "./product.controller";
import {
  createProductSchema,
  updateProductSchema,
  toggleProductSaveSchema,
  smartSearchBodySchema
} from "./product.schemas";
import { createReview, getReviewStatus, listProductReviews } from "../reviews/review.controller";
import { createReviewSchema } from "../reviews/review.schemas";
import { listSavedProductIds, listSavedProducts, toggleProductSave } from "./productSave.controller";

const router = Router();

/** Same roles as checkout: anyone shopping with an account may leave verified reviews. */
const shopAccountRoles = ["buyer", "seller", "admin"] as const;

/** Saved listings — must register before `/:id` so "saves" is not parsed as an id. */
router.get("/saves/ids", optionalProtect, listSavedProductIds);
router.get("/saves", optionalProtect, listSavedProducts);
router.post("/saves/toggle", optionalProtect, validateBody(toggleProductSaveSchema), toggleProductSave);

router.get("/", listProducts);
router.post("/smart-search", validateBody(smartSearchBodySchema), smartSearchProducts);
/** `GET /recommended` is mounted on the root app in {@link createApp} before this router mounts. */
router.get("/mine", protect, requireActiveAccount, authorize("seller", "admin"), listMyProducts);
router.post("/", protect, requireActiveAccount, authorize("seller", "admin"), validateBody(createProductSchema), createProduct);
router.get("/:id/reviews", listProductReviews);
router.get("/:id/review-status", protect, requireActiveAccount, authorize(...shopAccountRoles), getReviewStatus);
router.post("/:id/reviews", protect, requireActiveAccount, authorize(...shopAccountRoles), validateBody(createReviewSchema), createReview);
router.get("/:id/related", optionalProtect, getRelatedProducts);
router.post("/:id/view", protect, requireActiveAccount, authorize("buyer"), recordProductView);
router.get("/:id", optionalProtect, getProduct);
router.patch(
  "/:id",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  requireVendorSubscription,
  validateBody(updateProductSchema),
  updateProduct
);
router.delete(
  "/:id",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  requireVendorSubscription,
  deleteProduct
);

export default router;
