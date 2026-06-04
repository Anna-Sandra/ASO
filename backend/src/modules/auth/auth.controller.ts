import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import mongoose, { type HydratedDocument } from "mongoose";
import {
  bootstrapAdminSessionUserJson,
  ensureBootstrapAdminIfNoAdmins,
  getBootstrapAdminJwtSub,
  isBootstrapAdminJwtSub,
  matchesEnvBootstrapAdmin
} from "../../config/bootstrapAdmin";
import { env, isEmailTransportConfigured } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { sendEmail } from "../../utils/mailer";
import { isOtpConsoleLogEnabled, logOtpToConsole } from "../../utils/otpLog";
import { asyncHandler } from "../../utils/asyncHandler";
import { rewriteStoredMediaUrl } from "../../utils/publicMediaUrl";
import { Order } from "../orders/order.model";
import { Product } from "../products/product.model";
import { Delivery } from "../deliveries/delivery.model";
import { RiderProfile } from "../deliveries/riderProfile.model";
import { Review } from "../reviews/review.model";
import { VendorAnalyticsEvent } from "../vendor/vendorAnalyticsEvent.model";
import { VendorApplication } from "../vendorApplications/vendorApplication.model";
import { CourierApplication } from "../courierApplications/courierApplication.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";
import {
  initialVendorSubscriptionOnApproval,
  vendorBillingForUserId
} from "../vendorSubscription/vendorSubscription.service";
import { promoteBuyerToSellerFromVendorApplication } from "../../utils/promoteVendorFromApplication";
import { Token } from "./token.model";
import { User, normalizeUserRole, publicPhoneForPaymentRole, type UserDoc, type UserRole, type VendorProfileStatus, type RiderApplicationStatus } from "./user.model";
import {
  buildAccessTokenPayloadForDbUser,
  createOpaqueToken,
  sha256,
  signAccessToken,
  signBootstrapRefreshToken,
  tryVerifyBootstrapRefreshToken
} from "./jwt";
import { issueCsrfToken } from "../../middleware/csrf";
import {
  clearAdminAccessGateCookie,
  createAdminGateToken,
  setAdminAccessGateCookie
} from "../../middleware/adminGate";
import { allowAuthEmailAttempt } from "../../utils/authEmailRateLimit";
import { generateReferralCode, REFERRAL_REWARD_POINTS_EACH } from "../../utils/referral";
import { resetPasswordSchema } from "./auth.schemas";

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
  vendorStatus?: VendorProfileStatus;
  riderApplicationStatus?: RiderApplicationStatus;
  businessName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
};

function pickProfileFromUser(
  u: LeanUser
): {
  profileImageUrl: string;
  emailVerifiedAt?: Date | null;
  accountStatus: string;
  sellerVerified: boolean;
  vendorStatus: VendorProfileStatus;
  riderApplicationStatus: RiderApplicationStatus;
  businessName: string;
} {
  const role = normalizeUserRole(u.role);
  let vendorStatus = (u as { vendorStatus?: VendorProfileStatus }).vendorStatus;
  if (vendorStatus !== "pending" && vendorStatus !== "approved" && vendorStatus !== "rejected" && vendorStatus !== "none") {
    vendorStatus = role === "seller" ? "approved" : "none";
  }
  let riderApplicationStatus = (u as { riderApplicationStatus?: RiderApplicationStatus }).riderApplicationStatus;
  if (
    riderApplicationStatus !== "pending" &&
    riderApplicationStatus !== "rejected" &&
    riderApplicationStatus !== "none"
  ) {
    riderApplicationStatus = "none";
  }
  if (role === "rider") {
    riderApplicationStatus = "none";
  }
  return {
    profileImageUrl:
      rewriteStoredMediaUrl(
        typeof u.profileImageUrl === "string" && u.profileImageUrl.trim() ? u.profileImageUrl.trim() : ""
      ),
    emailVerifiedAt: u.emailVerifiedAt,
    accountStatus: (u as { accountStatus?: string }).accountStatus ?? "active",
    sellerVerified: Boolean((u as { sellerVerified?: boolean }).sellerVerified),
    vendorStatus,
    riderApplicationStatus: riderApplicationStatus ?? "none",
    businessName: typeof (u as { businessName?: string }).businessName === "string" ? (u as { businessName: string }).businessName.trim() : ""
  };
}

function serializeRoleDemotionNotice(u: LeanUser): { fromRole: string; message: string; at: string } | null {
  const n = (u as { roleDemotionNotice?: { fromRole?: string; message?: string; at?: Date } | null })
    .roleDemotionNotice;
  if (!n?.fromRole || !n.message?.trim()) return null;
  return {
    fromRole: n.fromRole,
    message: n.message.trim(),
    at: n.at ? new Date(n.at).toISOString() : new Date().toISOString()
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
  /** Vercel frontend + Render API: cross-site cookies need SameSite=None + Secure. */
  const crossSite = env.COOKIE_SECURE;
  return {
    httpOnly: true,
    sameSite: crossSite ? ("none" as const) : ("lax" as const),
    secure: crossSite,
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

function adminGateJsonExtras(userId: string, role: string): { adminGateToken?: string } {
  if (role !== "admin") return {};
  const adminGateToken = createAdminGateToken(userId);
  return adminGateToken ? { adminGateToken } : {};
}

async function sendLoginSuccess(res: Response, user: HydratedDocument<UserDoc>, extra?: Record<string, unknown>) {
  const role = normalizeUserRole(user.role);
  const accessPayload = buildAccessTokenPayloadForDbUser(user._id.toString(), role, user.email);
  const accessToken = signAccessToken(accessPayload);
  const { refreshToken } = await issueRefreshToken(user._id);

  res.cookie("refreshToken", refreshToken, refreshCookieOptions());
  if (role === "admin") setAdminAccessGateCookie(res, user._id.toString());
  const p = pickProfileFromUser(user as LeanUser);
  const recipient = String((user as { paystackTransferRecipientCode?: string }).paystackTransferRecipientCode || "").trim();
  const subacct = String((user as { paystackSubaccountCode?: string }).paystackSubaccountCode || "").trim();
  const vendorBilling = role === "seller" ? await vendorBillingForUserId(user._id.toString()) : null;
  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role,
      displayName: user.displayName ?? "",
      phone: publicPhoneForPaymentRole(role, user.phone),
      profileImageUrl: p.profileImageUrl,
      vendorStatus: p.vendorStatus,
      riderApplicationStatus: p.riderApplicationStatus,
      businessName: p.businessName,
      bankName: user.bankName ?? "",
      bankAccountNumber: user.bankAccountNumber ?? "",
      bankAccountName: user.bankAccountName ?? "",
      ...(role === "seller"
        ? {
            paystackPayoutRegistered: Boolean(recipient),
            paystackSubaccountRegistered: Boolean(subacct),
            ghanaPayoutChannel: (user as { ghanaPayoutChannel?: "ghipss" | "mobile_money" }).ghanaPayoutChannel,
            ghanaBankCode: (user as { ghanaBankCode?: string }).ghanaBankCode || "",
            vendorBilling
          }
        : {}),
      ...(accessPayload.al ? { adminLevel: accessPayload.al } : {}),
      roleDemotionNotice: serializeRoleDemotionNotice(user as LeanUser)
    },
    ...adminGateJsonExtras(user._id.toString(), role),
    ...extra
  });
}

/** Login success for BOOTSTRAP_ADMIN_* without a MongoDB user (works when DB is empty or offline). */
function sendEnvBootstrapAdminLoginSuccess(res: Response, extra?: Record<string, unknown>) {
  const sub = getBootstrapAdminJwtSub();
  const accessToken = signAccessToken({ sub, role: "admin", al: "super" });
  const bootstrapRefresh = signBootstrapRefreshToken();
  res.cookie("refreshToken", bootstrapRefresh, refreshCookieOptions());
  setAdminAccessGateCookie(res, sub);
  const u = bootstrapAdminSessionUserJson();
  res.json({
    accessToken,
    refreshToken: bootstrapRefresh,
    user: {
      id: u.id,
      email: u.email,
      role: u.role,
      displayName: u.displayName,
      phone: u.phone,
      profileImageUrl: u.profileImageUrl,
      vendorStatus: u.vendorStatus,
      riderApplicationStatus: u.riderApplicationStatus,
      businessName: u.businessName,
      bankName: u.bankName,
      bankAccountNumber: u.bankAccountNumber,
      bankAccountName: u.bankAccountName,
      adminLevel: "super" as const
    },
    ...adminGateJsonExtras(sub, "admin"),
    ...extra
  });
}

function loginOtpEmailHtml(otp: string) {
  return `<p>Your SHOPIQGH sign-in code:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes. If you did not try to sign in, you can ignore this email.</p>`;
}

function emailVerifyOtpHtml(otp: string) {
  return `<p>Your SHOPIQGH email verification code:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes.</p>`;
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
  logOtpToConsole("login_otp", addr, otp);
  const mail = await sendEmail(addr, "Your sign-in code", loginOtpEmailHtml(otp), { category: "login_otp" });

  res.json({
    needsOtp: true,
    email: addr || undefined,
    loginOtpEmailSent: mail.ok,
    ...(!mail.ok && mail.reason ? { loginOtpEmailError: mail.reason.slice(0, 500) } : {})
  });
}

async function uniqueReferralCodeForNewUser(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateReferralCode();
    const taken = await User.exists({ referralCode: code });
    if (!taken) return code;
  }
  return `${generateReferralCode()}${generateReferralCode().slice(0, 2)}`;
}

async function ensureUserReferralCode(userId: mongoose.Types.ObjectId): Promise<string> {
  const existing = await User.findById(userId).select("referralCode").lean();
  const cur = String((existing as { referralCode?: string })?.referralCode || "").trim();
  if (cur) return cur;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateReferralCode();
    const updated = await User.findOneAndUpdate(
      { _id: userId, $or: [{ referralCode: null }, { referralCode: "" }, { referralCode: { $exists: false } }] },
      { $set: { referralCode: code } },
      { new: true }
    )
      .select("referralCode")
      .lean();
    if (updated?.referralCode) return String(updated.referralCode);
    const again = await User.findById(userId).select("referralCode").lean();
    if (again?.referralCode) return String(again.referralCode);
  }
  throw new HttpError(500, "Could not generate your invite code. Try again later.");
}

export const getReferralInfo = asyncHandler(async (req: Request, res: Response) => {
  const role = normalizeUserRole(req.user?.role);
  if (role !== "buyer" && role !== "admin") {
    throw new HttpError(403, "Invite rewards are for shopper accounts.");
  }
  const uid = new mongoose.Types.ObjectId(req.user!.id);
  const code = await ensureUserReferralCode(uid);
  const inviteSignups = await User.countDocuments({ referredByUserId: uid });
  const shop = env.APP_ORIGIN.replace(/\/$/, "");
  res.json({
    code,
    shareUrl: `${shop}/register?ref=${encodeURIComponent(code)}`,
    inviteSignups,
    rewardPointsEach: REFERRAL_REWARD_POINTS_EACH,
    rewardGhsEach: REFERRAL_REWARD_POINTS_EACH / 100
  });
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, displayName, username, referralCode: refCodeIn } = req.body as {
    email: string;
    password: string;
    displayName?: string;
    username?: string;
    referralCode?: string;
  };
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new HttpError(400, "A valid email address is required.");
  if (!(await allowAuthEmailAttempt(`register:${cleanEmail}`, 8, 60 * 60 * 1000))) {
    throw new HttpError(429, "Too many registration attempts for this email. Try again later.");
  }

  const cleanDisplayNameRaw =
    typeof displayName === "string" ? displayName.trim().slice(0, 120) : typeof username === "string" ? username.trim().slice(0, 120) : "";
  const cleanDisplayName = cleanDisplayNameRaw;

  const platform = await getOrCreateSettings();
  if (platform.maintenanceMode === true) {
    const msg = (platform.maintenanceMessage || "").trim();
    throw new HttpError(503, msg || "The platform is undergoing maintenance. Please try again later.");
  }
  if (platform.allowPublicRegistration === false) {
    throw new HttpError(403, "New registrations are temporarily disabled. Please check back later.");
  }

  const existing = await User.findOne({ email: cleanEmail }).lean();
  if (existing) {
    throw new HttpError(409, "An account with this email already exists. Sign in instead, or use Forgot password.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const shouldEmailVerify = !env.AUTH_SKIP_EMAIL_VERIFICATION;
  const verifiedNow = shouldEmailVerify ? null : new Date();

  let referredByUserId: mongoose.Types.ObjectId | undefined;
  const refNorm = String(refCodeIn || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  if (refNorm.length >= 4) {
    const referrer = await User.findOne({ referralCode: refNorm }).select("_id email").lean();
    if (referrer && String(referrer.email || "").toLowerCase() !== cleanEmail) {
      referredByUserId = referrer._id as mongoose.Types.ObjectId;
    }
  }

  const user = await User.create({
    email: cleanEmail,
    passwordHash,
    role: "buyer",
    vendorStatus: "none",
    emailVerifiedAt: verifiedNow,
    referralCode: await uniqueReferralCodeForNewUser(),
    ...(referredByUserId ? { referredByUserId } : {}),
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

    logOtpToConsole("email_verify", cleanEmail, otp);
    await sendEmail(cleanEmail, "Verify your email", emailVerifyOtpHtml(otp));
  }

  res.status(201).json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      phone: publicPhoneForPaymentRole(user.role as UserRole, user.phone),
      role: user.role,
      displayName: user.displayName ?? "",
      vendorStatus: "none" as VendorProfileStatus,
      riderApplicationStatus: "none" as RiderApplicationStatus,
      businessName: ""
    },
    message: shouldEmailVerify ? "Verification email sent" : "Account created",
    requiresEmailVerification: shouldEmailVerify,
    ...(!canSendEmail && shouldEmailVerify && env.NODE_ENV !== "production" ? { devOtp } : {})
  });
});

export const csrfToken = asyncHandler(async (_req: Request, res: Response) => {
  const token = issueCsrfToken(res);
  res.json({ ok: true, message: "CSRF token issued.", csrfToken: token });
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
  if (!(await allowAuthEmailAttempt(`login:${lower}`, 30, 15 * 60 * 1000))) {
    throw new HttpError(429, "Too many sign-in attempts for this email. Wait a few minutes and try again.");
  }

  /** JWT-only “platform admin” when MongoDB is down: no user row, no OTP. Not used when the DB is up (same credentials go through normal login + OTP). */
  if (mongoose.connection.readyState !== 1) {
    if (matchesEnvBootstrapAdmin(identifier, password)) {
      sendEnvBootstrapAdminLoginSuccess(res);
      return;
    }
    throw new HttpError(
      503,
      "The database is unavailable. Only the configured platform admin account can sign in until MongoDB is reachable again."
    );
  }

  await ensureBootstrapAdminIfNoAdmins();
  const user = await User.findOne({ email: lower }).select("+passwordHash");
  if (!user) {
    const adminCount = await User.countDocuments({ role: "admin" });
    let msg = "No account found with this email. Check for typos, or create an account.";
    if (adminCount === 0) {
      msg +=
        " The database has no admin yet — set BOOTSTRAP_ADMIN_EMAIL to the address you use here and BOOTSTRAP_ADMIN_PASSWORD (8+ characters) in backend/.env, then try signing in again.";
    }
    throw new HttpError(401, msg);
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
  if (doc) {
    await Token.updateOne({ _id: doc._id }, { $set: { usedAt: new Date() } });
    await sendLoginSuccess(res, user);
    return;
  }

  const hasActiveOtp = await Token.exists({
    userId: user._id,
    purpose: "login_otp",
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (hasActiveOtp) {
    throw new HttpError(400, "That code is incorrect. Check the code in your email and try again.");
  }

  const hadAnyLoginOtp = await Token.exists({ userId: user._id, purpose: "login_otp" });
  if (hadAnyLoginOtp) {
    throw new HttpError(
      400,
      "This sign-in code has expired. Request a new code below.",
      "LOGIN_OTP_EXPIRED"
    );
  }
  throw new HttpError(400, "No valid sign-in code. Go back to sign in to receive a new code.");
});

export const resendVerificationOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  const addr = email.trim().toLowerCase();
  if (!(await allowAuthEmailAttempt(`verify-resend:${addr}`, 6, 15 * 60 * 1000))) {
    return res.json({ message: "If this account still needs verification, a new code was sent." });
  }
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

  logOtpToConsole("email_verify", addr, otp);
  await sendEmail(addr, "Your verification code", emailVerifyOtpHtml(otp));
  res.json({
    message: generic,
    ...(!canSendEmail && env.NODE_ENV !== "production" ? { devOtp: otp } : {})
  });
});

export const resendLoginOtp = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body as { identifier: string; password: string };
  const lower = identifier.trim().toLowerCase();
  if (!(await allowAuthEmailAttempt(`login-otp-resend:${lower}`, 8, 15 * 60 * 1000))) {
    throw new HttpError(429, "Too many code requests. Wait a few minutes and try again.");
  }
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
  logOtpToConsole("login_otp", addr, otp);
  const mail = await sendEmail(addr, "Your sign-in code", loginOtpEmailHtml(otp), { category: "login_otp" });
  if (!mail.ok) {
    throw new HttpError(
      502,
      `Could not send the sign-in code. ${mail.reason} Check spam, or ask an admin to verify email settings on the server.`
    );
  }
  res.json({ message: "A new sign-in code was sent." });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (isBootstrapAdminJwtSub(req.user!.id)) {
    const u = bootstrapAdminSessionUserJson();
    res.json({
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        displayName: u.displayName,
        phone: u.phone,
        profileImageUrl: u.profileImageUrl,
        emailVerifiedAt: new Date(),
        accountStatus: "active",
        sellerVerified: true,
        vendorStatus: u.vendorStatus,
        riderApplicationStatus: u.riderApplicationStatus,
        businessName: u.businessName,
        bankName: u.bankName,
        bankAccountNumber: u.bankAccountNumber,
        bankAccountName: u.bankAccountName,
        adminLevel: "super" as const,
        rewardPoints: 0,
        firstOrderDiscountEligible: false
      }
    });
    return;
  }

  const user = await User.findById(req.user!.id).lean();
  if (!user) throw new HttpError(404, "We couldn't find your account. Please sign in again.");
  const role = normalizeUserRole(user.role);
  const p = pickProfileFromUser(user as LeanUser);
  const recipient = String((user as { paystackTransferRecipientCode?: string }).paystackTransferRecipientCode || "").trim();
  const subacct = String((user as { paystackSubaccountCode?: string }).paystackSubaccountCode || "").trim();
  const vendorBilling = role === "seller" ? await vendorBillingForUserId(user._id.toString()) : null;
  const rewardPoints = Math.max(0, Math.floor(Number((user as { rewardPoints?: number }).rewardPoints) || 0));
  let firstOrderDiscountEligible = false;
  if (role === "buyer" || role === "seller" || role === "admin") {
    const priorPaid = await Order.countDocuments({
      buyerId: user._id,
      status: { $nin: ["pending_payment", "cancelled"] }
    });
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const withinWeek = Date.now() - new Date(user.createdAt).getTime() <= weekMs;
    firstOrderDiscountEligible = priorPaid === 0 && withinWeek;
  }
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
      vendorStatus: p.vendorStatus,
      riderApplicationStatus: p.riderApplicationStatus,
      businessName: p.businessName,
      bankName: user.bankName ?? "",
      bankAccountNumber: user.bankAccountNumber ?? "",
      bankAccountName: user.bankAccountName ?? "",
      rewardPoints,
      firstOrderDiscountEligible,
      ...(role === "seller"
        ? {
            paystackPayoutRegistered: Boolean(recipient),
            paystackSubaccountRegistered: Boolean(subacct),
            ghanaPayoutChannel: (user as { ghanaPayoutChannel?: "ghipss" | "mobile_money" }).ghanaPayoutChannel,
            ghanaBankCode: (user as { ghanaBankCode?: string }).ghanaBankCode || "",
            vendorBilling
          }
        : {}),
      ...(role === "admin" && req.user?.adminLevel
        ? { adminLevel: req.user.adminLevel }
        : {}),
      roleDemotionNotice: serializeRoleDemotionNotice(user as LeanUser)
    }
  });
});

export const ackRoleDemotionNotice = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new HttpError(404, "We couldn't find your account. Please sign in again.");
  (user as { roleDemotionNotice?: null }).roleDemotionNotice = null;
  user.markModified("roleDemotionNotice");
  await user.save();
  res.json({ ok: true });
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
  if (body.phone !== undefined && roleBefore !== "seller" && roleBefore !== "rider") {
    throw new HttpError(400, "Phone is only for seller payment contact or rider delivery contact.");
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
  const recipient = String((user as { paystackTransferRecipientCode?: string }).paystackTransferRecipientCode || "").trim();
  const subacct = String((user as { paystackSubaccountCode?: string }).paystackSubaccountCode || "").trim();
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email ?? "",
      role,
      displayName: user.displayName ?? "",
      phone: publicPhoneForPaymentRole(role, user.phone),
      profileImageUrl: p.profileImageUrl,
      vendorStatus: p.vendorStatus,
      riderApplicationStatus: p.riderApplicationStatus,
      businessName: p.businessName,
      bankName: user.bankName ?? "",
      bankAccountNumber: user.bankAccountNumber ?? "",
      bankAccountName: user.bankAccountName ?? "",
      ...(role === "seller"
        ? {
            paystackPayoutRegistered: Boolean(recipient),
            paystackSubaccountRegistered: Boolean(subacct),
            ghanaPayoutChannel: (user as { ghanaPayoutChannel?: "ghipss" | "mobile_money" }).ghanaPayoutChannel,
            ghanaBankCode: (user as { ghanaBankCode?: string }).ghanaBankCode || ""
          }
        : {})
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
  } else if (user.role === "rider") {
    const activeAssignments = await Delivery.countDocuments({
      assignedRiderId: uidObj,
      currentStage: { $nin: ["delivered", "cancelled"] }
    });
    if (activeAssignments > 0) {
      throw new HttpError(
        409,
        `You still have ${activeAssignments} active delivery assignment${activeAssignments === 1 ? "" : "s"}. Complete or hand them off before deleting your account.`
      );
    }
    await RiderProfile.deleteMany({ userId: uidObj });
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

  await VendorApplication.deleteMany({ userId: uidObj });
  await CourierApplication.deleteMany({ userId: uidObj });
  await Token.deleteMany({ userId: uidObj });
  await User.deleteOne({ _id: uidObj });
  res.clearCookie("refreshToken", refreshCookieOptions());
  clearAdminAccessGateCookie(res);
  res.json({ message: "Account deleted" });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const fromCookie = req.cookies?.refreshToken as string | undefined;
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  /** Prefer httpOnly cookie — localStorage body can be stale after rotation in another tab. */
  const candidates = [...new Set([fromCookie, fromBody].filter((t): t is string => Boolean(t && String(t).trim())))];
  if (!candidates.length) {
    res.json({ accessToken: null });
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, "The database is unavailable. Please sign in again when the server is healthy.");
  }

  let lastAuthError: HttpError | null = null;

  for (const refreshToken of candidates) {
    if (tryVerifyBootstrapRefreshToken(refreshToken)) {
      const sub = getBootstrapAdminJwtSub();
      const accessToken = signAccessToken({ sub, role: "admin", al: "super" });
      const bootstrapRefresh = signBootstrapRefreshToken();
      res.cookie("refreshToken", bootstrapRefresh, refreshCookieOptions());
      setAdminAccessGateCookie(res, sub);
      res.json({
        accessToken,
        refreshToken: bootstrapRefresh,
        ...adminGateJsonExtras(sub, "admin")
      });
      return;
    }

    const tokenHash = sha256(refreshToken);
    const existing = await Token.findOne({
      purpose: "refresh",
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    }).select("+tokenHash");

    if (!existing) {
      lastAuthError = new HttpError(401, "Your session has expired or is invalid. Please sign in again.");
      continue;
    }

    const user = await User.findById(existing.userId);
    if (!user) {
      lastAuthError = new HttpError(401, "Your session is no longer valid. Please sign in again.");
      continue;
    }

    const acc = (user as { accountStatus?: string }).accountStatus;
    if (acc && acc === "banned") {
      lastAuthError = new HttpError(403, "This account is banned.");
      continue;
    }
    if (acc && acc === "suspended") {
      lastAuthError = new HttpError(403, "This account is suspended. Contact support if you think this is a mistake.");
      continue;
    }

    await Token.updateOne({ _id: existing._id }, { $set: { revokedAt: new Date() } });

    const role = normalizeUserRole(user.role);
    const accessToken = signAccessToken(buildAccessTokenPayloadForDbUser(user._id.toString(), role, user.email));
    const rotated = await issueRefreshToken(user._id);

    res.cookie("refreshToken", rotated.refreshToken, refreshCookieOptions());
    if (role === "admin") setAdminAccessGateCookie(res, user._id.toString());
    else clearAdminAccessGateCookie(res);
    res.json({
      accessToken,
      refreshToken: rotated.refreshToken,
      ...adminGateJsonExtras(user._id.toString(), role)
    });
    return;
  }

  throw lastAuthError ?? new HttpError(401, "Your session has expired or is invalid. Please sign in again.");
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = (req.cookies?.refreshToken as string | undefined) || (req.body as any)?.refreshToken;
  if (refreshToken && mongoose.connection.readyState === 1) {
    try {
      await Token.updateMany(
        { purpose: "refresh", tokenHash: sha256(refreshToken), revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    } catch {
      /* offline DB — still clear cookie */
    }
  }

  res.clearCookie("refreshToken", refreshCookieOptions());
  clearAdminAccessGateCookie(res);
  res.json({ message: "Logged out" });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  const addr = email.trim().toLowerCase();
  if (!(await allowAuthEmailAttempt(`forgot:${addr}`, 6, 15 * 60 * 1000))) {
    return res.json({ message: "If that account exists, a 6-digit OTP was sent." });
  }
  const user = await User.findOne({ email: addr });
  const generic = "If that account exists, a 6-digit OTP was sent.";
  const devOtpInResponse = env.NODE_ENV !== "production";

  if (!user) {
    if (isOtpConsoleLogEnabled()) {
      // eslint-disable-next-line no-console
      console.log("[shopiqgh:otp] password_reset account_not_found", { email: addr });
    }
    return res.json({
      message: generic,
      ...(devOtpInResponse ? { devAccountFound: false } : {})
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

  logOtpToConsole("password_reset", addr, otp);
  const html = `<p>Password reset requested.</p><p><b>OTP:</b> ${otp}</p><p>This code expires in 10 minutes.</p>`;
  await sendEmail(user.email || addr, "Your password reset OTP", html);

  res.json({
    message: generic,
    ...(devOtpInResponse && !canSendEmail ? { devOtp: otp } : {})
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Please check your password and confirmation, then try again.");
  const { email, otp, token: setupToken, newPassword } = parsed.data;
  const addr = email.trim().toLowerCase();
  const user = await User.findOne({ email: addr });
  if (!user) {
    throw new HttpError(400, "No account found for this email. Check what you entered or create an account.");
  }

  const setupTrim = (setupToken || "").trim();
  const otpTrim = (otp || "").trim();
  const purpose = setupTrim.length >= 32 ? "password_setup" : "password_reset";
  const tokenHash = sha256(setupTrim.length >= 32 ? setupTrim : otpTrim);

  const doc = await Token.findOne({
    userId: user._id,
    purpose,
    tokenHash,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  }).select("+tokenHash");
  if (!doc) {
    throw new HttpError(
      400,
      purpose === "password_setup"
        ? "This password link is invalid or has expired. Ask your platform admin to send a new welcome email."
        : "That code is incorrect or has expired. Request a new code from Forgot password and try again."
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await Token.updateOne({ _id: doc._id }, { $set: { usedAt: new Date() } });
  await User.updateOne({ _id: doc.userId }, { $set: { passwordHash } });
  await Token.updateMany({ userId: doc.userId, purpose: "refresh", revokedAt: null }, { $set: { revokedAt: new Date() } });

  res.clearCookie("refreshToken", refreshCookieOptions());
  res.json({ message: "Password updated. Please log in again." });
});

export const activateAccount = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as { token: string; password: string };
  const tokenHash = sha256(token.trim());

  const app = await VendorApplication.findOne({
    status: "approved",
    activationTokenHash: tokenHash,
    activationExpiry: { $gt: new Date() }
  });
  if (!app) {
    throw new HttpError(400, "Invalid or expired activation link. Ask an admin to resend approval or submit a new application.");
  }

  const appEmail = (app.email || "").trim().toLowerCase();
  let user =
    (app.userId ? await User.findById(app.userId).select("+passwordHash") : null) ||
    (await User.findOne({ email: appEmail }).select("+passwordHash"));

  if (user) {
    const role = normalizeUserRole(user.role);
    if (role === "admin") {
      throw new HttpError(400, "This email is tied to an admin account and cannot be activated as a vendor.");
    }
    if (role === "rider") {
      throw new HttpError(400, "This email is tied to a courier account and cannot be activated as a vendor.");
    }
    if (role === "seller") {
      throw new HttpError(400, "This account is already a vendor. Please sign in.");
    }
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const promoteResult = await promoteBuyerToSellerFromVendorApplication(app, { passwordHash });

  if (promoteResult.kind === "needs_activation") {
    const settings = await getOrCreateSettings();
    const subInit = initialVendorSubscriptionOnApproval(settings);
    user = await User.create({
      email: appEmail,
      passwordHash,
      displayName: app.fullName.trim(),
      phone: app.phone.trim(),
      role: "seller",
      sellerVerified: true,
      vendorStatus: "approved",
      businessName: app.shopName,
      emailVerifiedAt: new Date(),
      accountStatus: "active",
      sellerApprovedAt: subInit.sellerApprovedAt,
      vendorSubscriptionStatus: subInit.vendorSubscriptionStatus
    });
    app.userId = user._id;
    app.activationTokenHash = null;
    app.activationExpiry = null;
    await app.save();
  } else if (promoteResult.kind === "promoted" || promoteResult.kind === "already_seller") {
    app.activationTokenHash = null;
    app.activationExpiry = null;
    await app.save();
  } else {
    throw new HttpError(400, "This account cannot be activated as a vendor.");
  }

  res.json({
    ok: true,
    message: "Account activated successfully. You can now sign in as a vendor."
  });
});

