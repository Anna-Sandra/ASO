import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import mongoose, { type HydratedDocument } from "mongoose";
import { env, isEmailTransportConfigured } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { sendEmail } from "../../utils/mailer";
import { asyncHandler } from "../../utils/asyncHandler";
import { Order } from "../orders/order.model";
import { Product } from "../products/product.model";
import { Review } from "../reviews/review.model";
import { VendorAnalyticsEvent } from "../vendor/vendorAnalyticsEvent.model";
import { Token } from "./token.model";
import { User, normalizeUserRole, publicPhoneForPaymentRole, type UserDoc, type UserRole } from "./user.model";
import { createOpaqueToken, sha256, signAccessToken } from "./jwt";

type LeanUser = {
  _id: mongoose.Types.ObjectId;
  email?: string;
  role: unknown;
  displayName?: string;
  phone?: string;
  profileImageUrl?: string;
  emailVerifiedAt?: Date | null;
  accountStatus?: string;
  sellerVerified?: boolean;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
};

function pickProfileFromUser(
  u: LeanUser
): { profileImageUrl: string; emailVerifiedAt?: Date | null; accountStatus: string; sellerVerified: boolean } {
  return {
    profileImageUrl: typeof u.profileImageUrl === "string" && u.profileImageUrl.trim() ? u.profileImageUrl.trim() : "",
    emailVerifiedAt: u.emailVerifiedAt,
    accountStatus: (u as { accountStatus?: string }).accountStatus ?? "active",
    sellerVerified: Boolean((u as { sellerVerified?: boolean }).sellerVerified)
  };
}

const SALT_ROUNDS = 12;
const PASSWORD_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFY_OTP_TTL_MS = 10 * 60 * 1000;
const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;
const ACTIVE_ORDER_STATUSES = ["pending_payment", "awaiting_vendor_payment", "paid", "processing", "delivered"] as const;
const canSendEmail = isEmailTransportConfigured();

function sixDigitOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/api/auth"
  };
}

async function issueRefreshToken(userId: mongoose.Types.ObjectId) {
  const refreshToken = createOpaqueToken();
  const tokenHash = sha256(refreshToken);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await Token.create({
    userId,
    purpose: "refresh",
    tokenHash,
    expiresAt
  });

  return { refreshToken, expiresAt };
}

async function sendLoginSuccess(res: Response, user: HydratedDocument<UserDoc>, extra?: Record<string, unknown>) {
  const role = normalizeUserRole(user.role);
  const accessToken = signAccessToken({ sub: user._id.toString(), role });
  const { refreshToken } = await issueRefreshToken(user._id);

  res.cookie("refreshToken", refreshToken, refreshCookieOptions());
  const p = pickProfileFromUser(user as LeanUser);
  res.json({
    accessToken,
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role,
      displayName: user.displayName ?? "",
      phone: publicPhoneForPaymentRole(role, user.phone),
      profileImageUrl: p.profileImageUrl,
      bankName: user.bankName ?? "",
      bankAccountNumber: user.bankAccountNumber ?? "",
      bankAccountName: user.bankAccountName ?? ""
    },
    ...extra
  });
}

function loginOtpEmailHtml(otp: string) {
  return `<p>Your Campus Market sign-in code:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes. If you did not try to sign in, you can ignore this email.</p>`;
}

function emailVerifyOtpHtml(otp: string) {
  return `<p>Your Campus Market email verification code:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes.</p>`;
}

async function issueLoginOtpAndRespond(user: HydratedDocument<UserDoc>, res: Response) {
  const otp = sixDigitOtp();
  await Token.updateMany(
    { userId: user._id, purpose: "login_otp", usedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  await Token.create({
    userId: user._id,
    purpose: "login_otp",
    tokenHash: sha256(otp),
    expiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS)
  });

  const addr = user.email?.trim() || "";
  await sendEmail(addr, "Your sign-in code", loginOtpEmailHtml(otp));

  res.json({
    needsOtp: true,
    email: addr || undefined
  });
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, role, displayName, username } = req.body as {
    email: string;
    password: string;
    role: "buyer" | "seller";
    displayName?: string;
    username?: string;
  };
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new HttpError(400, "A valid email address is required.");

  const cleanDisplayNameRaw =
    typeof displayName === "string" ? displayName.trim().slice(0, 120) : typeof username === "string" ? username.trim().slice(0, 120) : "";
  const cleanDisplayName = cleanDisplayNameRaw;

  const existing = await User.findOne({ email: cleanEmail }).lean();
  if (existing) {
    throw new HttpError(409, "An account with this email already exists. Sign in instead, or use Forgot password.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const shouldEmailVerify = !env.AUTH_SKIP_EMAIL_VERIFICATION;
  const verifiedNow = shouldEmailVerify ? null : new Date();
  const user = await User.create({
    email: cleanEmail,
    passwordHash,
    role,
    emailVerifiedAt: verifiedNow,
    ...(cleanDisplayName ? { displayName: cleanDisplayName } : {})
  });

  let devOtp = "";
  if (shouldEmailVerify) {
    const otp = sixDigitOtp();
    devOtp = otp;
    await Token.updateMany(
      { userId: user._id, purpose: "email_verify", usedAt: null, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    await Token.create({
      userId: user._id,
      purpose: "email_verify",
      tokenHash: sha256(otp),
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_OTP_TTL_MS)
    });

    await sendEmail(cleanEmail, "Verify your email", emailVerifyOtpHtml(otp));
  }

  res.status(201).json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      phone: publicPhoneForPaymentRole(user.role as UserRole, user.phone),
      role: user.role,
      displayName: user.displayName ?? ""
    },
    message: shouldEmailVerify ? "Verification email sent" : "Account created",
    requiresEmailVerification: shouldEmailVerify,
    ...(!canSendEmail && shouldEmailVerify && env.NODE_ENV !== "production" ? { devOtp } : {})
  });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp } = req.body as { email: string; otp: string };
  const addr = email.trim().toLowerCase();
  const user = await User.findOne({ email: addr });
  if (!user) {
    throw new HttpError(400, "That code is incorrect or has expired. Request a new code from the sign-in page.");
  }
  const tokenHash = sha256(otp);

  const doc = await Token.findOne({
    userId: user._id,
    purpose: "email_verify",
    tokenHash,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).select("+tokenHash");
  if (!doc) {
    throw new HttpError(400, "That code is incorrect or has expired. Request a new code from the sign-in page.");
  }

  await Token.updateOne({ _id: doc._id }, { $set: { usedAt: new Date() } });
  await User.updateOne({ _id: doc.userId }, { $set: { emailVerifiedAt: new Date() } });

  const userDoc = await User.findById(doc.userId);
  if (!userDoc) {
    throw new HttpError(500, "We verified your email but could not start your session. Please sign in.");
  }
  await sendLoginSuccess(res, userDoc, { message: "Email verified" });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body as { identifier: string; password: string };
  const lower = identifier.trim().toLowerCase();
  const user = await User.findOne({ email: lower }).select("+passwordHash");
  if (!user) {
    throw new HttpError(401, "No account found with this email. Check for typos, or create an account.");
  }
  if (!env.AUTH_SKIP_EMAIL_VERIFICATION && user.email && !user.emailVerifiedAt) {
    throw new HttpError(
      403,
      "Please verify your email before signing in. Check your inbox for the code we sent when you registered."
    );
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new HttpError(
      401,
      "Incorrect password. Try again, or use Forgot password to reset it."
    );
  }

  const acc = (user as { accountStatus?: string }).accountStatus;
  if (acc && acc === "banned") {
    throw new HttpError(403, "This account has been banned.");
  }
  if (acc && acc === "suspended") {
    throw new HttpError(403, "This account is suspended. Contact support if you think this is a mistake.");
  }

  const useLoginOtp = canSendEmail && !env.AUTH_SKIP_EMAIL_VERIFICATION;
  if (useLoginOtp) {
    await issueLoginOtpAndRespond(user, res);
    return;
  }

  await sendLoginSuccess(res, user);
});

export const verifyLoginOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp } = req.body as { email: string; otp: string };
  const addr = email.trim().toLowerCase();
  const user = await User.findOne({ email: addr });
  if (!user) {
    throw new HttpError(400, "That code is incorrect or has expired. Try again or sign in again.");
  }
  const tokenHash = sha256(otp);

  const doc = await Token.findOne({
    userId: user._id,
    purpose: "login_otp",
    tokenHash,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).select("+tokenHash");
  if (!doc) {
    throw new HttpError(400, "That code is incorrect or has expired. Try again or sign in again.");
  }

  await Token.updateOne({ _id: doc._id }, { $set: { usedAt: new Date() } });
  await sendLoginSuccess(res, user);
});

export const resendVerificationOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  const addr = email.trim().toLowerCase();
  const generic = "If this account still needs verification, a new code was sent.";
  const user = await User.findOne({ email: addr });
  if (!user || user.emailVerifiedAt) {
    res.json({ message: generic });
    return;
  }

  const otp = sixDigitOtp();
  await Token.updateMany(
    { userId: user._id, purpose: "email_verify", usedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  await Token.create({
    userId: user._id,
    purpose: "email_verify",
    tokenHash: sha256(otp),
    expiresAt: new Date(Date.now() + EMAIL_VERIFY_OTP_TTL_MS)
  });

  await sendEmail(addr, "Your verification code", emailVerifyOtpHtml(otp));
  res.json({
    message: generic,
    ...(!canSendEmail && env.NODE_ENV !== "production" ? { devOtp: otp } : {})
  });
});

export const resendLoginOtp = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body as { identifier: string; password: string };
  const lower = identifier.trim().toLowerCase();
  const user = await User.findOne({ email: lower }).select("+passwordHash");
  if (!user) {
    throw new HttpError(401, "No account found with this email. Check for typos, or create an account.");
  }
  if (!env.AUTH_SKIP_EMAIL_VERIFICATION && user.email && !user.emailVerifiedAt) {
    throw new HttpError(
      403,
      "Please verify your email before signing in. Check your inbox for the code we sent when you registered."
    );
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new HttpError(401, "Incorrect password. Try again, or use Forgot password to reset it.");
  }

  const acc = (user as { accountStatus?: string }).accountStatus;
  if (acc && acc === "banned") {
    throw new HttpError(403, "This account has been banned.");
  }
  if (acc && acc === "suspended") {
    throw new HttpError(403, "This account is suspended. Contact support if you think this is a mistake.");
  }

  if (!canSendEmail || env.AUTH_SKIP_EMAIL_VERIFICATION) {
    throw new HttpError(400, "Email sign-in codes are not enabled on this server.");
  }

  const otp = sixDigitOtp();
  await Token.updateMany(
    { userId: user._id, purpose: "login_otp", usedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  await Token.create({
    userId: user._id,
    purpose: "login_otp",
    tokenHash: sha256(otp),
    expiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS)
  });

  const addr = user.email?.trim() || lower;
  await sendEmail(addr, "Your sign-in code", loginOtpEmailHtml(otp));
  res.json({ message: "A new sign-in code was sent." });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).lean();
  if (!user) throw new HttpError(404, "We couldn't find your account. Please sign in again.");
  const role = normalizeUserRole(user.role);
  const p = pickProfileFromUser(user as LeanUser);
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role,
      displayName: user.displayName ?? "",
      phone: publicPhoneForPaymentRole(role, user.phone),
      profileImageUrl: p.profileImageUrl,
      emailVerifiedAt: p.emailVerifiedAt,
      accountStatus: p.accountStatus,
      sellerVerified: p.sellerVerified,
      bankName: user.bankName ?? "",
      bankAccountNumber: user.bankAccountNumber ?? "",
      bankAccountName: user.bankAccountName ?? ""
    }
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    displayName?: string;
    phone?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountName?: string;
    clearProfileImage?: boolean;
  };
  const roleBefore = normalizeUserRole((await User.findById(req.user!.id).select("role").lean())?.role);
  if (body.phone !== undefined && roleBefore !== "seller") {
    throw new HttpError(400, "Phone is only for seller payment contact (Mobile Money).");
  }

  const patch: Record<string, string> = {};
  if (body.displayName !== undefined) patch.displayName = body.displayName;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.bankName !== undefined) patch.bankName = body.bankName;
  if (body.bankAccountNumber !== undefined) patch.bankAccountNumber = body.bankAccountNumber;
  if (body.bankAccountName !== undefined) patch.bankAccountName = body.bankAccountName;
  if (body.clearProfileImage) patch.profileImageUrl = "";
  const user = await User.findByIdAndUpdate(req.user!.id, { $set: patch }, { new: true }).lean();
  if (!user) throw new HttpError(404, "We couldn't update your profile. Please sign in again.");
  const p = pickProfileFromUser(user as LeanUser);
  const role = normalizeUserRole(user.role);
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role,
      displayName: user.displayName ?? "",
      phone: publicPhoneForPaymentRole(role, user.phone),
      profileImageUrl: p.profileImageUrl,
      bankName: user.bankName ?? "",
      bankAccountNumber: user.bankAccountNumber ?? "",
      bankAccountName: user.bankAccountName ?? ""
    }
  });
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { password, confirm } = req.body as { password: string; confirm: string };
  if (String(confirm || "").trim().toUpperCase() !== "DELETE") {
    throw new HttpError(400, 'Type "DELETE" to confirm account deletion');
  }
  const uid = req.user!.id;
  const user = await User.findById(uid).select("+passwordHash role");
  if (!user) throw new HttpError(404, "We couldn't find your account. Please sign in again.");
  if (user.role === "admin") throw new HttpError(403, "This account cannot be deleted here.");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Incorrect password. Enter your current password to confirm deletion.");

  const uidObj = new mongoose.Types.ObjectId(uid);
  if (user.role === "buyer") {
    const active = await Order.countDocuments({
      buyerId: uidObj,
      status: { $in: [...ACTIVE_ORDER_STATUSES] }
    });
    if (active > 0) {
      throw new HttpError(
        409,
        `You still have ${active} active order${active === 1 ? "" : "s"}. Complete or cancel them before deleting your account.`
      );
    }
  } else if (user.role === "seller") {
    const active = await Order.countDocuments({
      "items.sellerId": uidObj,
      status: { $in: [...ACTIVE_ORDER_STATUSES] }
    });
    if (active > 0) {
      throw new HttpError(
        409,
        `You still have ${active} active sales order${active === 1 ? "" : "s"}. Complete or cancel them before deleting your account.`
      );
    }
    const sellerProductIds = await Product.find({ sellerId: uidObj }).distinct("_id");
    if (sellerProductIds.length > 0) {
      await Review.deleteMany({ productId: { $in: sellerProductIds } });
    }
    await VendorAnalyticsEvent.deleteMany({ sellerId: uidObj });
    await Product.deleteMany({ sellerId: uidObj });
  }

  await Token.deleteMany({ userId: uidObj });
  await User.deleteOne({ _id: uidObj });
  res.clearCookie("refreshToken", refreshCookieOptions());
  res.json({ message: "Account deleted" });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const fromCookie = req.cookies?.refreshToken as string | undefined;
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  const refreshToken = fromBody || fromCookie;
  // No cookie/body is normal when logged out — avoid 4xx noise in the browser for startup refresh.
  if (!refreshToken) {
    res.json({ accessToken: null });
    return;
  }

  const tokenHash = sha256(refreshToken);
  const existing = await Token.findOne({
    purpose: "refresh",
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).select("+tokenHash");
  if (!existing) throw new HttpError(401, "Your session has expired or is invalid. Please sign in again.");

  const user = await User.findById(existing.userId);
  if (!user) throw new HttpError(401, "Your session is no longer valid. Please sign in again.");

  await Token.updateOne({ _id: existing._id }, { $set: { revokedAt: new Date() } });

  const role = normalizeUserRole(user.role);
  const accessToken = signAccessToken({ sub: user._id.toString(), role });
  const rotated = await issueRefreshToken(user._id);

  res.cookie("refreshToken", rotated.refreshToken, refreshCookieOptions());
  res.json({ accessToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = (req.cookies?.refreshToken as string | undefined) || (req.body as any)?.refreshToken;
  if (refreshToken) {
    await Token.updateMany(
      { purpose: "refresh", tokenHash: sha256(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }

  res.clearCookie("refreshToken", refreshCookieOptions());
  res.json({ message: "Logged out" });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  const addr = email.trim().toLowerCase();
  const user = await User.findOne({ email: addr });
  const generic = "If that account exists, a 6-digit OTP was sent.";
  const devOtpEnabled = env.NODE_ENV !== "production";

  if (!user) {
    if (devOtpEnabled) {
      // eslint-disable-next-line no-console
      console.log("[forgot-password:dev] account_not_found", { email: addr });
    }
    return res.json({
      message: generic,
      ...(devOtpEnabled ? { devAccountFound: false } : {})
    });
  }

  const otp = sixDigitOtp();
  await Token.updateMany({ userId: user._id, purpose: "password_reset", usedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await Token.create({
    userId: user._id,
    purpose: "password_reset",
    tokenHash: sha256(otp),
    expiresAt: new Date(Date.now() + PASSWORD_OTP_TTL_MS)
  });

  if (devOtpEnabled) {
    // eslint-disable-next-line no-console
    console.log("[forgot-password:dev] otp_generated", { email: addr, otp });
  }
  const html = `<p>Password reset requested.</p><p><b>OTP:</b> ${otp}</p><p>This code expires in 10 minutes.</p>`;
  await sendEmail(user.email || addr, "Your password reset OTP", html);

  res.json({
    message: generic,
    ...(devOtpEnabled && !canSendEmail ? { devOtp: otp } : {})
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body as { email: string; otp: string; newPassword: string };
  const addr = email.trim().toLowerCase();
  const user = await User.findOne({ email: addr });
  if (!user) {
    throw new HttpError(400, "No account found for this email. Check what you entered or create an account.");
  }
  const tokenHash = sha256(otp);

  const doc = await Token.findOne({
    userId: user._id,
    purpose: "password_reset",
    tokenHash,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).select("+tokenHash");
  if (!doc) {
    throw new HttpError(
      400,
      "That code is incorrect or has expired. Request a new code from Forgot password and try again."
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await Token.updateOne({ _id: doc._id }, { $set: { usedAt: new Date() } });
  await User.updateOne({ _id: doc.userId }, { $set: { passwordHash } });
  await Token.updateMany({ userId: doc.userId, purpose: "refresh", revokedAt: null }, { $set: { revokedAt: new Date() } });

  res.clearCookie("refreshToken", refreshCookieOptions());
  res.json({ message: "Password updated. Please log in again." });
});

