import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { authorize, protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { MAX_PRODUCT_IMAGES_PER_UPLOAD } from "../../config/productLimits";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { publicPhoneForPaymentRole, normalizeUserRole, User } from "../auth/user.model";

const router = Router();
const uploadsRoot = path.join(process.cwd(), "uploads");
const allowedImageMimes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function publicUploadUrl(file: Express.Multer.File) {
  return `/uploads/${path.relative(uploadsRoot, file.path).split(path.sep).join("/")}`;
}

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const subdir = file.fieldname === "image" ? "profiles" : "products";
    const dir = path.join(uploadsRoot, subdir);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".img";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedImageMimes.has(file.mimetype)) {
      cb(new HttpError(400, "Only JPEG, PNG, WebP, or GIF images are allowed"));
      return;
    }
    cb(null, true);
  }
});

router.post(
  "/product-images",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  upload.array("images", MAX_PRODUCT_IMAGES_PER_UPLOAD),
  (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    res.json({ urls: files.map(publicUploadUrl) });
  }
);

router.post(
  "/profile-image",
  protect,
  requireActiveAccount,
  upload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Image file is required");
    const profileImageUrl = publicUploadUrl(req.file);
    const user = await User.findByIdAndUpdate(req.user!.id, { $set: { profileImageUrl } }, { new: true }).lean();
    if (!user) throw new HttpError(404, "We couldn't update your profile. Please sign in again.");
    const role = normalizeUserRole(user.role);
    res.json({
      url: profileImageUrl,
      user: {
        id: user._id.toString(),
        email: user.email ?? "",
        role,
        displayName: user.displayName ?? "",
        phone: publicPhoneForPaymentRole(role, user.phone),
        profileImageUrl,
        bankName: user.bankName ?? "",
        bankAccountNumber: user.bankAccountNumber ?? "",
        bankAccountName: user.bankAccountName ?? ""
      }
    });
  })
);

export default router;
