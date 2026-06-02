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
  const platform = await getOrCreateSettings();
  if (platform.maintenanceMode === true) {
    const msg = (platform.maintenanceMessage || "").trim();
    throw new HttpError(503, msg || "The platform is undergoing maintenance. Please try again later.");
  }
  if (platform.allowCourierApplications === false) {
    throw new HttpError(403, "Courier applications are temporarily closed.");
  }

  const body = req.body as {
    fullName: string;
    phone: string;
    vehicleType: string;
    notes: string;
    idDocUrl?: string;
    locationLat: number;
    locationLng: number;
    locationLabel?: string;
    locationAccuracyM?: number | null;
    email?: string;
  };

  let user: InstanceType<typeof User> | null = null;
  if (req.user) {
    const u = await User.findById(req.user.id);
    if (!u) throw new HttpError(404, "Account not found.");
    user = u;
    const role = normalizeUserRole(user.role);
    if (role !== "buyer") {
      throw new HttpError(
        400,
        "Delivery partner onboarding is open to shoppers — sign out and apply as a guest, or switch to your buyer profile."
      );
    }
    const applyStatus = resolveRiderApplyStatus(
      user as { role?: unknown; riderApplicationStatus?: RiderApplicationStatus }
    );
    if (applyStatus === "pending") throw new HttpError(409, "You already have a pending courier application.");
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
        "Your profile has no email. Add one under Profile — or include an email in your submission."
      );
    }
  } else {
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      throw new HttpError(400, "Please enter your email — we’ll use it if admins need to contact you.");
    }
  }

  const orFilter: Array<Record<string, unknown>> = [{ email }];
  if (user) orFilter.push({ userId: user._id });

  const dup = await CourierApplication.exists({ status: "pending", $or: orFilter });
  if (dup) {
    throw new HttpError(
      409,
      user ? "You already have a pending courier application." : "An application with this email is already pending review."
    );
  }

  await CourierApplication.create({
    userId: user?._id ?? null,
    fullName: body.fullName.trim(),
    email,
    phone: body.phone.trim(),
    vehicleType: body.vehicleType.trim(),
    notes: body.notes.trim(),
    idDocUrl: (body.idDocUrl || "").trim(),
    locationLat: Number(body.locationLat),
    locationLng: Number(body.locationLng),
    locationLabel: (body.locationLabel || "").trim(),
    locationAccuracyM:
      body.locationAccuracyM != null && Number.isFinite(Number(body.locationAccuracyM))
        ? Number(body.locationAccuracyM)
        : null,
    status: "pending"
  });

  if (user) {
    await User.updateOne({ _id: user._id }, { $set: { riderApplicationStatus: "pending" as RiderApplicationStatus } });
  }

  res.status(201).json({ message: "Application submitted. We will notify you after an admin reviews it." });
});

export const getMyCourierApplicationStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).lean();
  if (!user) throw new HttpError(404, "Account not found.");
  const latest = await CourierApplication.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean();
  res.json({
    riderApplicationStatus: resolveRiderApplyStatus(
      user as { role?: unknown; riderApplicationStatus?: RiderApplicationStatus }
    ),
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
