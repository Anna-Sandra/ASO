import { Router } from "express";
import { protect, authorize, optionalProtect, authorizeGuestOrBuyerApplicationUpload } from "../../middleware/auth";
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
  uploadBookPdfMiddleware,
  uploadDeliveryProof,
  uploadDeliveryProofMiddleware
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
  optionalProtect,
  requireActiveAccount,
  authorizeGuestOrBuyerApplicationUpload,
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

router.post(
  "/delivery-proof",
  protect,
  requireActiveAccount,
  authorize("rider", "admin"),
  uploadDeliveryProofMiddleware,
  uploadDeliveryProof
);

export default router;
