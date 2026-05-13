import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import {
  uploadProductImages,
  uploadProductImagesMiddleware,
  uploadProfileImage,
  uploadProfileImageMiddleware,
  uploadReportEvidence,
  uploadReportEvidenceMiddleware,
  uploadVendorVerification,
  uploadVendorVerificationMiddleware,
  uploadBookPdf,
  uploadBookPdfMiddleware
} from "./upload.controller";

const router = Router();

router.post(
  "/product-images",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  uploadProductImagesMiddleware,
  uploadProductImages
);

router.post(
  "/profile-image",
  protect,
  requireActiveAccount,
  uploadProfileImageMiddleware,
  uploadProfileImage
);

router.post(
  "/vendor-verification",
  protect,
  requireActiveAccount,
  authorize("buyer"),
  uploadVendorVerificationMiddleware,
  uploadVendorVerification
);

router.post(
  "/book-pdf",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  uploadBookPdfMiddleware,
  uploadBookPdf
);

router.post(
  "/report-evidence",
  protect,
  requireActiveAccount,
  authorize("buyer", "seller", "admin"),
  uploadReportEvidenceMiddleware,
  uploadReportEvidence
);

export default router;
