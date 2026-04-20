import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { sendEmail } from "../../utils/mailer";
import { sendSms } from "../../utils/sms";
import { asyncHandler } from "../../utils/asyncHandler";
import { Order } from "../orders/order.model";
import { Product } from "../products/product.model";
import { Review } from "../reviews/review.model";
import { VendorAnalyticsEvent } from "../vendor/vendorAnalyticsEvent.model";
import { Token } from "./token.model";
import { User, normalizeUserRole } from "./user.model";
import { createOpaqueToken, sha256, signAccessToken } from "./jwt";

const SALT_ROUNDS = 12;
const PASSWORD_OTP_TTL_MS = 10 * 60 * 1000;
const ACTIVE_ORDER_STATUSES = ["pending_payment", "awaiting_vendor_payment", "paid", "processing", "delivered"] as const;
const canSendEmail = !!env.SMTP_HOST && !!env.SMTP_USER && !!env.SMTP_PASS;
const canSendSms =
  env.SMS_PROVIDER === "twilio" &&
  !!env.TWILIO_ACCOUNT_SID &&
  !!env.TWILIO_AUTH_TOKEN &&
  !!env.TWILIO_FROM_NUMBER;

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

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, phone, password, role, displayName, username } = req.body as {
    email?: string;
    phone?: string;
    password: string;
    role: "buyer" | "seller";
    displayName?: string;
    username?: string;
  };
  const cleanEmail = email?.trim().toLowerCase();
  const cleanPhone = phone?.trim();
  if (!cleanEmail && !cleanPhone) throw new HttpError(400, "Provide either an email address or a phone number.");

  const cleanDisplayNameRaw =
    typeof displayName === "string" ? displayName.trim().slice(0, 120) : typeof username === "string" ? username.trim().slice(0, 120) : "";
  const cleanDisplayName = cleanDisplayNameRaw;

  const or: Record<string, string>[] = [];
  if (cleanEmail) or.push({ email: cleanEmail });
  if (cleanPhone) or.push({ phone: cleanPhone });
  const existing = await User.findOne({ $or: or }).lean();
  if (existing) {
    throw new HttpError(
      409,
      "An account with this email or phone number already exists. Sign in instead, or use Forgot password."
    );
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const shouldEmailVerify = !!cleanEmail && !env.AUTH_SKIP_EMAIL_VERIFICATION;
  const verifiedNow = shouldEmailVerify ? null : new Date();
  const user = await User.create({
    email: cleanEmail,
    phone: cleanPhone,
    passwordHash,
    role,
    emailVerifiedAt: verifiedNow,
    ...(cleanDisplayName ? { displayName: cleanDisplayName } : {})
  });

  let devVerificationToken = "";
  if (shouldEmailVerify) {
    const raw = createOpaqueToken();
    devVerificationToken = raw;
    await Token.create({
      userId: user._id,
      purpose: "email_verify",
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    const html = `<p>Verify your Campus Market account:</p><p><b>Token:</b> ${raw}</p><p>This token expires in 10 minutes.</p>`;
    await sendEmail(cleanEmail!, "Verify your email", html);
  }

  res.status(201).json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      phone: user.phone ?? "",
      role: user.role,
      displayName: user.displayName ?? ""
    },
    message: shouldEmailVerify ? "Verification email sent" : "Account created",
    ...(!canSendEmail && shouldEmailVerify && env.NODE_ENV !== "production"
      ? { devVerificationToken }
      : {})
  });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  const tokenHash = sha256(token);

  const doc = await Token.findOne({
    purpose: "email_verify",
    tokenHash,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).select("+tokenHash");
  if (!doc) throw new HttpError(400, "This verification link is invalid or has expired. Request a new email from the sign-in page.");

  await Token.updateOne({ _id: doc._id }, { $set: { usedAt: new Date() } });
  await User.updateOne({ _id: doc.userId }, { $set: { emailVerifiedAt: new Date() } });

  res.json({ message: "Email verified" });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body as { identifier: string; password: string };
  const normalized = identifier.trim();
  const lower = normalized.toLowerCase();
  const user = await User.findOne({
    $or: [{ email: lower }, { phone: normalized }]
  }).select("+passwordHash");
  if (!user) {
    throw new HttpError(
      401,
      "No account found with this email or phone. Check for typos, or create an account."
    );
  }
  if (!env.AUTH_SKIP_EMAIL_VERIFICATION && user.email && !user.emailVerifiedAt) {
    throw new HttpError(
      403,
      "Please verify your email before signing in. Check your inbox for the link we sent when you registered."
    );
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new HttpError(
      401,
      "Incorrect password. Try again, or use Forgot password to reset it."
    );
  }

  const role = normalizeUserRole(user.role);
  const accessToken = signAccessToken({ sub: user._id.toString(), role });
  const { refreshToken } = await issueRefreshToken(user._id);

  res.cookie("refreshToken", refreshToken, refreshCookieOptions());
  res.json({
    accessToken,
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role,
      displayName: user.displayName ?? "",
      phone: user.phone ?? "",
      bankName: user.bankName ?? "",
      bankAccountNumber: user.bankAccountNumber ?? "",
      bankAccountName: user.bankAccountName ?? ""
    }
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).lean();
  if (!user) throw new HttpError(404, "We couldn't find your account. Please sign in again.");
  const role = normalizeUserRole(user.role);
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role,
      displayName: user.displayName ?? "",
      phone: user.phone ?? "",
      emailVerifiedAt: user.emailVerifiedAt,
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
  };
  const patch: Record<string, string> = {};
  if (body.displayName !== undefined) patch.displayName = body.displayName;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.bankName !== undefined) patch.bankName = body.bankName;
  if (body.bankAccountNumber !== undefined) patch.bankAccountNumber = body.bankAccountNumber;
  if (body.bankAccountName !== undefined) patch.bankAccountName = body.bankAccountName;
  const user = await User.findByIdAndUpdate(req.user!.id, { $set: patch }, { new: true }).lean();
  if (!user) throw new HttpError(404, "We couldn't update your profile. Please sign in again.");
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role: normalizeUserRole(user.role),
      displayName: user.displayName ?? "",
      phone: user.phone ?? "",
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
  const { channel, identifier } = req.body as { channel: "email" | "phone"; identifier: string };
  const normalized = identifier.trim();
  const email = normalized.toLowerCase();
  const user = await User.findOne(channel === "email" ? { email } : { phone: normalized });
  const generic = "If that account exists, a 6-digit OTP was sent.";
  const devOtpEnabled = env.NODE_ENV !== "production";

  if (!user) {
    if (devOtpEnabled) {
      // eslint-disable-next-line no-console
      console.log("[forgot-password:dev] account_not_found", { channel, identifier: normalized });
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
    console.log("[forgot-password:dev] otp_generated", { channel, identifier: normalized, otp });
  }
  if (channel === "email") {
    const html = `<p>Password reset requested.</p><p><b>OTP:</b> ${otp}</p><p>This code expires in 10 minutes.</p>`;
    await sendEmail(user.email || email, "Your password reset OTP", html);
  } else {
    await sendSms(user.phone || normalized, `Your Campus Mart password reset OTP is ${otp}. It expires in 10 minutes.`);
  }

  res.json({
    message: generic,
    ...(devOtpEnabled && ((channel === "email" && !canSendEmail) || (channel === "phone" && !canSendSms))
      ? { devOtp: otp }
      : {})
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { channel, identifier, otp, newPassword } = req.body as {
    channel: "email" | "phone";
    identifier: string;
    otp: string;
    newPassword: string;
  };
  const normalized = identifier.trim();
  const email = normalized.toLowerCase();
  const user = await User.findOne(channel === "email" ? { email } : { phone: normalized });
  if (!user) {
    throw new HttpError(400, "No account found for this email or phone. Check what you entered or create an account.");
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

