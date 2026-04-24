import { Router } from "express";
import { protect, authorize, optionalProtect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listMyProducts,
  listProducts,
  updateProduct
} from "./product.controller";
import { createProductSchema, updateProductSchema } from "./product.schemas";
import { createReview, getReviewStatus, listProductReviews } from "../reviews/review.controller";
import { createReviewSchema } from "../reviews/review.schemas";

const router = Router();

/** Same roles as checkout: anyone shopping with an account may leave verified reviews. */
const shopAccountRoles = ["buyer", "seller", "admin"] as const;

router.get("/", listProducts);
router.get("/mine", protect, requireActiveAccount, authorize("seller", "admin"), listMyProducts);
router.post("/", protect, requireActiveAccount, authorize("seller", "admin"), validateBody(createProductSchema), createProduct);
router.get("/:id/reviews", listProductReviews);
router.get("/:id/review-status", protect, requireActiveAccount, authorize(...shopAccountRoles), getReviewStatus);
router.post("/:id/reviews", protect, requireActiveAccount, authorize(...shopAccountRoles), validateBody(createReviewSchema), createReview);
router.get("/:id", optionalProtect, getProduct);
router.patch("/:id", protect, requireActiveAccount, authorize("seller", "admin"), validateBody(updateProductSchema), updateProduct);
router.delete("/:id", protect, requireActiveAccount, authorize("seller", "admin"), deleteProduct);

export default router;
