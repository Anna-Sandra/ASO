import { Router } from "express";
import { protect, authorize, optionalProtect } from "../../middleware/auth";
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
router.get("/mine", protect, authorize("seller"), listMyProducts);
router.post("/", protect, authorize("seller"), validateBody(createProductSchema), createProduct);
router.get("/:id/reviews", listProductReviews);
router.get("/:id/review-status", protect, authorize(...shopAccountRoles), getReviewStatus);
router.post("/:id/reviews", protect, authorize(...shopAccountRoles), validateBody(createReviewSchema), createReview);
router.get("/:id", optionalProtect, getProduct);
router.patch("/:id", protect, authorize("seller"), validateBody(updateProductSchema), updateProduct);
router.delete("/:id", protect, authorize("seller"), deleteProduct);

export default router;
