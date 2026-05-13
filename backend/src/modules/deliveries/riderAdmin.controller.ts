import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { User, normalizeUserRole, publicPhoneForPaymentRole } from "../auth/user.model";
import { RiderProfile } from "./riderProfile.model";
import { adminCreateRiderSchema } from "./delivery.schemas";
import { adminRidersQuerySchema } from "../admin/admin.schemas";

const SALT_ROUNDS = 12;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const listAdminRiders = asyncHandler(async (req: Request, res: Response) => {
  const q = adminRidersQuerySchema.parse(req.query);
  const skip = (q.page - 1) * q.limit;
  const and: Record<string, unknown>[] = [{ role: "rider" }];
  if (q.accountStatus !== "all") {
    and.push({ accountStatus: q.accountStatus });
  }
  if (q.verified === "yes") {
    and.push({ emailVerifiedAt: { $ne: null } });
  } else if (q.verified === "no") {
    and.push({
      $or: [{ emailVerifiedAt: null }, { emailVerifiedAt: { $exists: false } }]
    });
  }
  if (q.search.trim()) {
    const re = new RegExp(escapeRegex(q.search.trim()), "i");
    and.push({
      $or: [{ email: re }, { displayName: re }, { phone: re }]
    });
  }
  const filter =
    and.length === 1
      ? and[0] as Record<string, unknown>
      : { $and: and };
  const [rows, total, riderPopulation] = await Promise.all([
    User.find(filter)
      .select("email phone displayName role accountStatus emailVerifiedAt createdAt profileImageUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(q.limit)
      .lean(),
    User.countDocuments(filter),
    User.countDocuments({ role: "rider" })
  ]);
  const userIds = rows.map((u) => u._id);
  const profiles = userIds.length
    ? await RiderProfile.find({ userId: { $in: userIds } }).lean()
    : [];
  const profileByUserId = new Map(profiles.map((p) => [p.userId.toString(), p]));
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    riders: rows.map((u) => {
      const rp = profileByUserId.get(u._id.toString());
      const role = (u as { role: string }).role;
      return {
        id: u._id.toString(),
        email: u.email ?? "",
        phone: publicPhoneForPaymentRole(normalizeUserRole(role), (u as { phone?: string }).phone),
        displayName: (u as { displayName?: string }).displayName ?? "",
        accountStatus: (u as { accountStatus?: string }).accountStatus ?? "active",
        emailVerified: Boolean((u as { emailVerifiedAt?: Date | null }).emailVerifiedAt),
        createdAt: u.createdAt,
        profileImageUrl: (u as { profileImageUrl?: string }).profileImageUrl ?? "",
        riderProfile: rp
          ? {
              id: rp._id.toString(),
              vehicleType: rp.vehicleType ?? "",
              photoUrl: rp.photoUrl?.trim() || ""
            }
          : null
      };
    }),
    total,
    page: q.page,
    limit: q.limit,
    counts: { riders: riderPopulation }
  });
});

export const postAdminCreateRider = asyncHandler(async (req: Request, res: Response) => {
  const body = adminCreateRiderSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) throw new HttpError(409, "An account with this email already exists.");
  const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);
  const user = await User.create({
    email,
    passwordHash,
    role: "rider",
    displayName: body.displayName?.trim() || "",
    phone: body.phone?.trim() || "",
    emailVerifiedAt: env.AUTH_SKIP_EMAIL_VERIFICATION ? new Date() : null,
    vendorStatus: "none"
  });
  await RiderProfile.create({
    userId: user._id,
    vehicleType: body.vehicleType.trim()
  });
  res.status(201).json({
    ok: true,
    user: {
      id: user._id.toString(),
      email: user.email,
      role: normalizeUserRole(user.role),
      displayName: user.displayName,
      phone: user.phone
    }
  });
});
