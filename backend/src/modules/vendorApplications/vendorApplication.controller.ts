import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User, normalizeUserRole, type VendorProfileStatus } from "../auth/user.model";
import { VendorApplication } from "./vendorApplication.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";

function resolveVendorStatus(u: { role?: unknown; vendorStatus?: VendorProfileStatus }): VendorProfileStatus {
  const role = normalizeUserRole(u.role);
  const vs = u.vendorStatus;
  if (vs === "pending" || vs === "approved" || vs === "rejected" || vs === "none") return vs;
  return role === "seller" ? "approved" : "none";
}

export const submitVendorApplication = asyncHandler(async (req: Request, res: Response) => {
  const uid = req.user!.id;
  const user = await User.findById(uid);
  if (!user) throw new HttpError(404, "Account not found.");

  const role = normalizeUserRole(user.role);
  if (role === "admin") throw new HttpError(400, "Admins cannot submit vendor applications.");
  if (role === "seller") throw new HttpError(400, "You are already a vendor.");

  const platform = await getOrCreateSettings();
  if (platform.maintenanceMode === true) {
    const msg = (platform.maintenanceMessage || "").trim();
    throw new HttpError(503, msg || "The platform is undergoing maintenance. Please try again later.");
  }
  if (platform.allowVendorApplications === false) {
    throw new HttpError(403, "Vendor applications are temporarily closed.");
  }

  const vs = resolveVendorStatus(user as { role?: unknown; vendorStatus?: VendorProfileStatus });
  if (vs === "pending") throw new HttpError(409, "You already have a pending vendor application.");

  const body = req.body as {
    fullName: string;
    shopName: string;
    category: string;
    sellsDescription: string;
    phone: string;
    altPhone?: string;
    shopDescription: string;
    verificationDocUrl?: string;
    locationBase: string;
    nearbyArea: string;
  };

  const email = (user.email || "").trim().toLowerCase();
  if (!email) throw new HttpError(400, "Your account must have an email.");

  const existingPending = await VendorApplication.findOne({ userId: user._id, status: "pending" });
  if (existingPending) throw new HttpError(409, "You already have a pending application.");

  await VendorApplication.create({
    userId: user._id,
    fullName: body.fullName.trim(),
    email,
    shopName: body.shopName.trim(),
    category: body.category,
    sellsDescription: body.sellsDescription.trim(),
    phone: body.phone.trim(),
    altPhone: (body.altPhone || "").trim(),
    shopDescription: body.shopDescription.trim(),
    verificationDocUrl: (body.verificationDocUrl || "").trim(),
    locationBase: body.locationBase,
    nearbyArea: body.nearbyArea.trim(),
    status: "pending"
  });

  await User.updateOne({ _id: user._id }, { $set: { vendorStatus: "pending" } });

  res.status(201).json({ message: "Application submitted. We will email you when it is reviewed." });
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
