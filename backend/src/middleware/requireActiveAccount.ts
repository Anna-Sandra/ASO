import type { NextFunction, Request, Response } from "express";
import { isBootstrapAdminJwtSub } from "../config/bootstrapAdmin";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../utils/httpError";
import { User } from "../modules/auth/user.model";

/** Block suspended or banned users from using protected API routes (after JWT is valid). */
export const requireActiveAccount = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next();
  if (isBootstrapAdminJwtSub(req.user.id)) return next();
  const u = await User.findById(req.user.id).select("accountStatus").lean();
  if (!u) return next(new HttpError(401, "Unauthorized"));
  const s = (u as { accountStatus?: string }).accountStatus;
  if (s && s !== "active") {
    return next(
      new HttpError(403, s === "banned" ? "This account is banned." : "This account is suspended. Contact support if you think this is a mistake.")
    );
  }
  next();
});
