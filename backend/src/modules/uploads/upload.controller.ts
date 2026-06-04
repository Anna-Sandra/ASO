import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import multer from "multer";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { tryResolvePublicUploadBaseUrl } from "../../utils/publicMediaUrl";
import { cloudinary, isCloudinaryConfigured } from "../../config/cloudinary";
import { assertUploadStorageAvailable } from "../../utils/uploadStorage";
import { User, normalizeUserRole, publicPhoneForPaymentRole } from "../auth/user.model";
import { assertUploadedFileKinds, assertUploadedFilesKinds } from "../../utils/validateUpload";

const PUBLIC_UPLOAD_BASE_ERR =
  "Could not resolve public URL for uploads. Set API_PUBLIC_ORIGIN to your HTTPS API origin (e.g. https://your-service.onrender.com).";

function requirePublicUploadBase(req: Request): string {
  const base = tryResolvePublicUploadBaseUrl(req);
  if (!base) throw new HttpError(500, PUBLIC_UPLOAD_BASE_ERR);
  return base;
}

async function cloudinaryUploadMulterFile(
  file: Express.Multer.File,
  folder: string,
  resourceType: "image" | "auto" | "raw"
): Promise<string> {
  if (!file.buffer?.length) {
    throw new HttpError(500, "Missing file data for Cloudinary upload.");
  }
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const rt = resourceType === "raw" ? "raw" : resourceType === "image" ? "image" : "auto";
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `shopiqgh/${folder}`,
    public_id: randomUUID(),
    resource_type: rt
  });
  return result.secure_url;
}

// ── multer: Cloudinary uses memory; local fallback keeps disk + stable filenames ──

const memoryStorage = multer.memoryStorage();

const uploadDir = path.resolve(process.cwd(), "uploads", "products");
const productDiskStorage = multer.diskStorage({
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

const imageFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
  if (!ok) {
    cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
    return;
  }
  cb(null, true);
};

export const uploadProductImagesMiddleware = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : productDiskStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: imageFilter
}).array("images", 8);

export const uploadProductImages = asyncHandler(async (req: Request, res: Response) => {
  assertUploadStorageAvailable();
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) throw new HttpError(400, "No image files received");
  await assertUploadedFilesKinds(files, ["jpeg", "png", "webp", "gif"]);

  let urls: string[];
  if (isCloudinaryConfigured()) {
    urls = await Promise.all(files.map((f) => cloudinaryUploadMulterFile(f, "products", "image")));
  } else {
    const base = requirePublicUploadBase(req);
    urls = files.map((f) => `${base}/uploads/products/${f.filename}`);
  }
  res.status(201).json({ urls });
});

const avatarDir = path.resolve(process.cwd(), "uploads", "avatars");
const avatarDiskStorage = multer.diskStorage({
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
  storage: isCloudinaryConfigured() ? memoryStorage : avatarDiskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter
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
  storage: isCloudinaryConfigured() ? memoryStorage : vendorVerifyStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    if (!ok) {
      cb(new Error("Only JPEG, PNG, or WebP images are allowed"));
      return;
    }
    cb(null, true);
  }
}).single("file");

export const uploadVendorVerification = asyncHandler(async (req: Request, res: Response) => {
  assertUploadStorageAvailable();
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No file received");
  await assertUploadedFileKinds(file, ["jpeg", "png", "webp"]);

  const url = isCloudinaryConfigured()
    ? await cloudinaryUploadMulterFile(file, "vendor-verification", "auto")
    : `${requirePublicUploadBase(req)}/uploads/vendor-verification/${file.filename}`;

  res.status(201).json({ url });
});

const vendorSelfieDir = path.resolve(process.cwd(), "uploads", "vendor-selfies");
const vendorSelfieStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(vendorSelfieDir, { recursive: true });
    cb(null, vendorSelfieDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${randomUUID()}${safe}`);
  }
});

export const uploadVendorSelfieMiddleware = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : vendorSelfieStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter
}).single("file");

export const uploadVendorSelfie = asyncHandler(async (req: Request, res: Response) => {
  assertUploadStorageAvailable();
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No file received");
  await assertUploadedFileKinds(file, ["jpeg", "png", "webp", "gif"]);
  const url = isCloudinaryConfigured()
    ? await cloudinaryUploadMulterFile(file, "vendor-selfies", "image")
    : `${requirePublicUploadBase(req)}/uploads/vendor-selfies/${file.filename}`;
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
  storage: isCloudinaryConfigured() ? memoryStorage : reportEvidenceStorage,
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
  assertUploadStorageAvailable();
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No file received");
  await assertUploadedFileKinds(file, ["jpeg", "png", "webp"]);

  const url = isCloudinaryConfigured()
    ? await cloudinaryUploadMulterFile(file, "report-evidence", "image")
    : `${requirePublicUploadBase(req)}/uploads/report-evidence/${file.filename}`;

  res.status(201).json({ url });
});

const bookPdfDir = path.resolve(process.cwd(), "uploads", "book-pdfs");
const bookPdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(bookPdfDir, { recursive: true });
    cb(null, bookPdfDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = ext === ".pdf" ? ext : ".pdf";
    cb(null, `${randomUUID()}${safe}`);
  }
});

export const uploadBookPdfMiddleware = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : bookPdfStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed for book uploads"));
      return;
    }
    cb(null, true);
  }
}).single("file");

export const uploadBookPdf = asyncHandler(async (req: Request, res: Response) => {
  assertUploadStorageAvailable();
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No file received");
  await assertUploadedFileKinds(file, ["pdf"]);

  const url = isCloudinaryConfigured()
    ? await cloudinaryUploadMulterFile(file, "book-pdfs", "raw")
    : `${requirePublicUploadBase(req)}/uploads/book-pdfs/${file.filename}`;

  res.status(201).json({ url });
});

const deliveryProofDir = path.resolve(process.cwd(), "uploads", "delivery-proof");
const deliveryProofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(deliveryProofDir, { recursive: true });
    cb(null, deliveryProofDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${randomUUID()}${safe}`);
  }
});

export const uploadDeliveryProofMiddleware = multer({
  storage: isCloudinaryConfigured() ? memoryStorage : deliveryProofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter
}).single("image");

export const uploadDeliveryProof = asyncHandler(async (req: Request, res: Response) => {
  assertUploadStorageAvailable();
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No image file received");
  await assertUploadedFileKinds(file, ["jpeg", "png", "webp"]);

  const url = isCloudinaryConfigured()
    ? await cloudinaryUploadMulterFile(file, "delivery-proof", "image")
    : `${requirePublicUploadBase(req)}/uploads/delivery-proof/${file.filename}`;

  res.status(201).json({ url });
});

export const uploadProfileImage = asyncHandler(async (req: Request, res: Response) => {
  assertUploadStorageAvailable();
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, "No image file received");
  await assertUploadedFileKinds(file, ["jpeg", "png", "webp", "gif"]);

  const url = isCloudinaryConfigured()
    ? await cloudinaryUploadMulterFile(file, "avatars", "image")
    : `${requirePublicUploadBase(req)}/uploads/avatars/${file.filename}`;

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
