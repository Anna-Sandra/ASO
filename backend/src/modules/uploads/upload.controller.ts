import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import multer from "multer";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User, normalizeUserRole, publicPhoneForPaymentRole } from "../auth/user.model";

const uploadDir = path.resolve(process.cwd(), "uploads", "products");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
    cb(null, `${randomUUID()}${safe}`);
  }
});

export const uploadProductImagesMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
    if (!ok) {
      cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
      return;
    }
    cb(null, true);
  }
}).array("images", 8);

export const uploadProductImages = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) throw new HttpError(400, "No image files received");

  const host = req.get("host");
  if (!host) throw new HttpError(500, "Could not determine host for image URLs");
  const base = `${req.protocol}://${host}`;
  const urls = files.map((f) => `${base}/uploads/products/${f.filename}`);
  res.status(201).json({ urls });
});

const avatarDir = path.resolve(process.cwd(), "uploads", "avatars");

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(avatarDir, { recursive: true });
    cb(null, avatarDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
    cb(null, `${randomUUID()}${safe}`);
  }
});

export const uploadProfileImageMiddleware = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
    if (!ok) {
      cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
      return;
    }
    cb(null, true);
  }
}).single("image");

const vendorVerifyDir = path.resolve(process.cwd(), "uploads", "vendor-verification");

const vendorVerifyStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(vendorVerifyDir, { recursive: true });
    cb(null, vendorVerifyDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = [".jpg", ".jpeg", ".png", ".pdf"].includes(ext) ? ext : ".bin";
    cb(null, `${randomUUID()}${safe}`);
  }
});

export const uploadVendorVerificationMiddleware = multer({
  storage: vendorVerifyStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "application/pdf"].includes(file.mimetype);
    if (!ok) {
      cb(new Error("Only JPEG, PNG, or PDF are allowed"));
      return;
    }
    cb(null, true);
  }
}).single("file");

export const uploadVendorVerification = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No file received");

  const host = req.get("host");
  if (!host) throw new HttpError(500, "Could not determine host for file URL");
  const base = `${req.protocol}://${host}`;
  const url = `${base}/uploads/vendor-verification/${file.filename}`;
  res.status(201).json({ url });
});

const reportEvidenceDir = path.resolve(process.cwd(), "uploads", "report-evidence");

const reportEvidenceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(reportEvidenceDir, { recursive: true });
    cb(null, reportEvidenceDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${randomUUID()}${safe}`);
  }
});

export const uploadReportEvidenceMiddleware = multer({
  storage: reportEvidenceStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    if (!ok) {
      cb(new Error("Only JPEG, PNG, or WebP images are allowed (max 5 MB)"));
      return;
    }
    cb(null, true);
  }
}).single("file");

export const uploadReportEvidence = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No file received");

  const host = req.get("host");
  if (!host) throw new HttpError(500, "Could not determine host for file URL");
  const base = `${req.protocol}://${host}`;
  const url = `${base}/uploads/report-evidence/${file.filename}`;
  res.status(201).json({ url });
});

export const uploadProfileImage = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No image file received");

  const host = req.get("host");
  if (!host) throw new HttpError(500, "Could not determine host for image URLs");
  const base = `${req.protocol}://${host}`;
  const url = `${base}/uploads/avatars/${file.filename}`;

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: { profileImageUrl: url } },
    { new: true, projection: { passwordHash: 0 } }
  ).lean();
  if (!user) throw new HttpError(404, "We couldn't update your profile. Please sign in again.");

  const role = normalizeUserRole(user.role);
  res.status(201).json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role,
      displayName: user.displayName ?? "",
      phone: publicPhoneForPaymentRole(role, user.phone),
      profileImageUrl: typeof user.profileImageUrl === "string" ? user.profileImageUrl : "",
      emailVerifiedAt: user.emailVerifiedAt,
      accountStatus: (user as { accountStatus?: string }).accountStatus ?? "active",
      sellerVerified: Boolean((user as { sellerVerified?: boolean }).sellerVerified),
      bankName: user.bankName ?? "",
      bankAccountNumber: user.bankAccountNumber ?? "",
      bankAccountName: user.bankAccountName ?? ""
    }
  });
});
