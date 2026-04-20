import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env";
import { protect } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { forgotPassword, getMe, login, logout, refresh, register, resetPassword, updateProfile, verifyEmail } from "./auth.controller";
import {
  forgotPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema
} from "./auth.schemas";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
/** Login is capped tighter in production; dev often hits 429 from refresh/StrictMode/typos. Successful 2xx logins do not count. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 25 : 200,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
});

router.post("/register", authLimiter, validateBody(registerSchema), register);
router.post("/verify-email", authLimiter, validateBody(verifyEmailSchema), verifyEmail);
router.post("/login", loginLimiter, validateBody(loginSchema), login);
router.post("/refresh", authLimiter, validateBody(refreshSchema), refresh);
router.post("/logout", authLimiter, logout);

router.post("/forgot-password", authLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), resetPassword);

router.get("/me", protect, getMe);
router.patch("/profile", protect, validateBody(profileUpdateSchema), updateProfile);
/** Account deletion is registered on the root app in `app.ts` (POST /api/auth/delete-account, etc.). */

export default router;

