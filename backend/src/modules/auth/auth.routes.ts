import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env";
import { requireCsrf } from "../../middleware/csrf";
import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import {
  activateAccount,
  csrfToken,
  forgotPassword,
  getMe,
  login,
  logout,
  refresh,
  register,
  resendLoginOtp,
  resendVerificationOtp,
  resetPassword,
  updateProfile,
  verifyEmail,
  verifyLoginOtp
} from "./auth.controller";
import {
  activateAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  refreshSchema,
  registerSchema,
  resendVerificationOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyLoginOtpSchema
} from "./auth.schemas";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
const otpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 });
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
router.post(
  "/resend-verification-otp",
  authLimiter,
  validateBody(resendVerificationOtpSchema),
  resendVerificationOtp
);
router.post("/verify-login-otp", otpVerifyLimiter, validateBody(verifyLoginOtpSchema), verifyLoginOtp);
router.post("/resend-login-otp", loginLimiter, validateBody(loginSchema), resendLoginOtp);
router.post("/login", loginLimiter, validateBody(loginSchema), login);
router.get("/csrf", authLimiter, csrfToken);
router.post("/refresh", authLimiter, requireCsrf, validateBody(refreshSchema), refresh);
router.post("/logout", authLimiter, requireCsrf, logout);

router.post("/activate-account", authLimiter, validateBody(activateAccountSchema), activateAccount);
router.post("/forgot-password", authLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), resetPassword);

router.get("/me", protect, requireActiveAccount, getMe);
router.patch("/profile", protect, requireActiveAccount, validateBody(profileUpdateSchema), updateProfile);
/** Account deletion is registered on the root app in `app.ts` (POST /api/auth/delete-account, etc.). */

export default router;

