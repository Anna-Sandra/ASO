import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { User, normalizeUserRole, type RiderApplicationStatus } from "../auth/user.model";
import { CourierApplication } from "./courierApplication.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";

function resolveRiderApplyStatus(user: {
  role?: unknown;
  riderApplicationStatus?: RiderApplicationStatus;
}): RiderApplicationStatus {
  const role = normalizeUserRole(user.role);
  if (role === "rider") return "none";
  const s = user.riderApplicationStatus;
  if (s === "pending" || s === "rejected" || s === "none") return s;
  return "none";
}

export const submitCourierApplication = asyncHandler(async (req: Request, res: Response) => {
  const uid = req.user!.id;
  const user = await User.findById(uid);
  if (!user) throw new HttpError(404, "Account not found.");

  const role = normalizeUserRole(user.role);
  if (role !== "buyer") {
    throw new HttpError(400, "Only shopper accounts can apply to deliver. Contact support if this is unexpected.");
  }

  const platform = await getOrCreateSettings();
  if (platform.maintenanceMode === true) {
    const msg = (platform.maintenanceMessage || "").trim();
    throw new HttpError(503, msg || "The platform is undergoing maintenance. Please try again later.");
  }
  if (platform.allowCourierApplications === false) {
    throw new HttpError(403, "Courier applications are temporarily closed.");
  }

  const applyStatus = resolveRiderApplyStatus(user as { role?: unknown; riderApplicationStatus?: RiderApplicationStatus });
  if (applyStatus === "pending") throw new HttpError(409, "You already have a pending courier application.");

  const body = req.body as {
    fullName: string;
    phone: string;
    vehicleType: string;
    notes: string;
    idDocUrl?: string;
  };

  const email = (user.email || "").trim().toLowerCase();
  if (!email) throw new HttpError(400, "Your account must have an email.");

  const existingPending = await CourierApplication.findOne({ userId: user._id, status: "pending" });
  if (existingPending) throw new HttpError(409, "You already have a pending application.");

  await CourierApplication.create({
    userId: user._id,
    fullName: body.fullName.trim(),
    email,
    phone: body.phone.trim(),
    vehicleType: body.vehicleType.trim(),
    notes: body.notes.trim(),
    idDocUrl: (body.idDocUrl || "").trim(),
    status: "pending"
  });

  await User.updateOne({ _id: user._id }, { $set: { riderApplicationStatus: "pending" as RiderApplicationStatus } });

  res.status(201).json({ message: "Application submitted. We will notify you after an admin reviews it." });
});

export const getMyCourierApplicationStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).lean();
  if (!user) throw new HttpError(404, "Account not found.");
  const latest = await CourierApplication.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean();
  res.json({
    riderApplicationStatus: resolveRiderApplyStatus(user as { role?: unknown; riderApplicationStatus?: RiderApplicationStatus }),
    latestApplication: latest
      ? {
          id: latest._id.toString(),
          status: latest.status,
          vehicleType: latest.vehicleType,
          createdAt: latest.createdAt,
          adminNote: latest.adminNote || ""
        }
      : null
  });
});
