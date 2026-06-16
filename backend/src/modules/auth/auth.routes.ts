import { Router } from "express";
import { env } from "../../config/env";
import { createRateLimiter } from "../../utils/createRateLimiter";
import { requireCsrf } from "../../middleware/csrf";
import { protect } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import {
  ackRoleDemotionNotice,
  activateAccount,
  csrfToken,
  forgotPassword,
  getMe,
  getReferralInfo,
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

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 20 });
/** Refresh + CSRF are on the hot path for staying signed in — do not share the tight auth bucket. */
const csrfLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 120 });
const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 120 : 300,
  skipSuccessfulRequests: true
});
const otpVerifyLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 50 });
const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 8 : 40
});
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 12 : 80
});
/** Login is capped tighter in production; dev often hits 429 from refresh/StrictMode/typos. Successful 2xx logins do not count. */
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 25 : 200,
  skipSuccessfulRequests: true
});

router.post("/register", registerLimiter, validateBody(registerSchema), register);
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
router.get("/csrf", csrfLimiter, csrfToken);
router.post("/refresh", refreshLimiter, requireCsrf, validateBody(refreshSchema), refresh);
router.post("/logout", authLimiter, requireCsrf, logout);

router.post("/activate-account", authLimiter, validateBody(activateAccountSchema), activateAccount);
router.post("/forgot-password", forgotPasswordLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), resetPassword);

router.get("/me", protect, requireActiveAccount, getMe);
router.post("/ack-role-notice", protect, requireActiveAccount, ackRoleDemotionNotice);
router.get("/referral", protect, requireActiveAccount, getReferralInfo);
router.patch("/profile", protect, requireActiveAccount, validateBody(profileUpdateSchema), updateProfile);
/** Account deletion is registered on the root app in `app.ts` (POST /api/auth/delete-account, etc.). */

export default router;

