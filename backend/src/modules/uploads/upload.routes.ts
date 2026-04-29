import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";

import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { HttpError } from "../../utils/httpError";
import { User } from "../auth/user.model";

const router = Router();

const uploadRoot = path.join(process.cwd(), "uploads");
const avatarDir = path.join(uploadRoot, "avatars");
const productDir = path.join(uploadRoot, "products");
fs.mkdirSync(avatarDir, { recursive: true });
fs.mkdirSync(productDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, req.path.includes("product-images") ? productDir : avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = req.user?.id ?? "user";
    cb(null, `${userId}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, or WEBP images are allowed"));
      return;
    }
    cb(null, true);
  }
});

router.post("/profile-image", protect, requireActiveAccount, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, "Image file is required");
    if (!req.user) throw new HttpError(401, "Unauthorized");

    const profileImageUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.user.id, { profileImageUrl }, { new: true });
    if (!user) throw new HttpError(404, "User not found");

    res.status(201).json({ profileImageUrl });
  } catch (err) {
    next(err);
  }
});

router.post("/product-images", protect, requireActiveAccount, upload.array("images", 6), async (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) throw new HttpError(400, "At least one image file is required");

    res.status(201).json({ imageUrls: files.map((file) => `/uploads/products/${file.filename}`) });
  } catch (err) {
    next(err);
  }
});

export default router;
