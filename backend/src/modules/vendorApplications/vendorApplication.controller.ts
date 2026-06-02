import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User, normalizeUserRole, type VendorProfileStatus } from "../auth/user.model";
import { VendorApplication } from "./vendorApplication.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";
import { emailVendorApplicationReceived } from "../../utils/vendorApplicationActivation";
import { verifyVendorIdentityWithSelfie } from "../../utils/vendorIdentityVerification";

function resolveVendorStatus(u: { role?: unknown; vendorStatus?: VendorProfileStatus }): VendorProfileStatus {
  const role = normalizeUserRole(u.role);
  const vs = u.vendorStatus;
  if (vs === "pending" || vs === "approved" || vs === "rejected" || vs === "none") return vs;
  return role === "seller" ? "approved" : "none";
}

export const submitVendorApplication = asyncHandler(async (req: Request, res: Response) => {
  const platform = await getOrCreateSettings();
  if (platform.maintenanceMode === true) {
    const msg = (platform.maintenanceMessage || "").trim();
    throw new HttpError(503, msg || "The platform is undergoing maintenance. Please try again later.");
  }
  if (platform.allowVendorApplications === false) {
    throw new HttpError(403, "Vendor applications are temporarily closed.");
  }

  const body = req.body as {
    fullName: string;
    shopName: string;
    category: string;
    sellsDescription: string;
    phone: string;
    altPhone?: string;
    shopDescription: string;
    verificationDocUrl?: string;
    selfieUrl?: string;
    locationBase: string;
    nearbyArea: string;
    email?: string;
  };

  let user: InstanceType<typeof User> | null = null;
  if (req.user) {
    const u = await User.findById(req.user.id);
    if (!u) throw new HttpError(404, "Account not found.");
    user = u;
    const role = normalizeUserRole(user.role);
    if (role === "admin") throw new HttpError(400, "Admins cannot submit vendor applications.");
    if (role === "seller") throw new HttpError(400, "You are already a vendor.");
    if (role !== "buyer") {
      throw new HttpError(
        400,
        "Use a shopper account to apply while signed in, or sign out and apply as a guest with your email."
      );
    }
    const vs = resolveVendorStatus(user as { role?: unknown; vendorStatus?: VendorProfileStatus });
    if (vs === "pending") throw new HttpError(409, "You already have a pending vendor application.");
  }

  let email = "";
  if (user) {
    email = (user.email || "").trim().toLowerCase();
    const fromBody =
      typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : "";
    if (!email && fromBody) email = fromBody;
    if (!email) {
      throw new HttpError(
        400,
        "Your profile has no email. Add one under Profile — or include an email address in your application payload."
      );
    }
  } else {
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      throw new HttpError(
        400,
        "Please enter a valid email address so admins can reply about your vendor application."
      );
    }
  }

  const orFilter: Array<Record<string, unknown>> = [{ email }];
  if (user) orFilter.push({ userId: user._id });

  const existingPending = await VendorApplication.exists({
    status: "pending",
    $or: orFilter
  });
  if (existingPending) {
    throw new HttpError(
      409,
      user
        ? "You already have a pending vendor application."
        : "An application with this email is already pending review."
    );
  }

  const faceMatch = await verifyVendorIdentityWithSelfie(
    (body.verificationDocUrl || "").trim(),
    (body.selfieUrl || "").trim()
  );
  if (faceMatch.status === "mismatch") {
    throw new HttpError(
      400,
      "Selfie does not match the ID clearly enough. Please retake the selfie in good lighting and try again."
    );
  }

  await VendorApplication.create({
    userId: user?._id ?? null,
    fullName: body.fullName.trim(),
    email,
    shopName: body.shopName.trim(),
    category: body.category,
    sellsDescription: body.sellsDescription.trim(),
    phone: body.phone.trim(),
    altPhone: (body.altPhone || "").trim(),
    shopDescription: body.shopDescription.trim(),
    verificationDocUrl: (body.verificationDocUrl || "").trim(),
    selfieUrl: (body.selfieUrl || "").trim(),
    faceMatchStatus: faceMatch.status,
    faceMatchConfidence: faceMatch.confidence,
    faceMatchProvider: faceMatch.provider,
    faceMatchReason: faceMatch.reason,
    faceMatchCheckedAt: faceMatch.checkedAt,
    locationBase: body.locationBase,
    nearbyArea: body.nearbyArea.trim(),
    status: "pending"
  });

  if (user) {
    await User.updateOne({ _id: user._id }, { $set: { vendorStatus: "pending" } });
  } else {
    void emailVendorApplicationReceived({
      email,
      fullName: body.fullName.trim(),
      shopName: body.shopName.trim()
    }).catch((err) => {
      console.warn("[vendor-application] confirmation email failed:", err instanceof Error ? err.message : err);
    });
  }

  res.status(201).json({
    message: user
      ? "Application submitted. We will email you when it is reviewed."
      : "Application submitted. Check your email for next steps and we will notify you when it is reviewed."
  });
});

export const getMyVendorApplicationStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).lean();
  if (!user) throw new HttpError(404, "Account not found.");
  const latest = await VendorApplication.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean();
  res.json({
    vendorStatus: resolveVendorStatus(user as { role?: unknown; vendorStatus?: VendorProfileStatus }),
    latestApplication: latest
      ? {
          id: latest._id.toString(),
          status: latest.status,
          shopName: latest.shopName,
          createdAt: latest.createdAt,
          adminNote: latest.adminNote || ""
        }
      : null
  });
});
