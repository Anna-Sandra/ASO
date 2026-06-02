import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../utils/httpError";
import {
  allAdminPermissionsTrue,
  type AdminPermissionKey,
  loadAdminPermissionsForRequest,
  permissionDeniedMessage
} from "../modules/admin/adminPermissions";

export const attachAdminPermissions = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin") return next();
  if (req.user.adminLevel === "super") {
    req.adminPermissions = allAdminPermissionsTrue();
    return next();
  }
  req.adminPermissions = await loadAdminPermissionsForRequest(req);
  next();
});

export function requireAdminPermission(...keys: AdminPermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== "admin") {
      return next(new HttpError(403, "You do not have permission to use this feature."));
    }
    if (req.user.adminLevel === "super") return next();
    const perms = req.adminPermissions;
    if (!perms) {
      return next(new HttpError(500, "Admin permissions were not loaded for this request."));
    }
    const missing = keys.filter((k) => !perms[k]);
    if (missing.length) {
      return next(new HttpError(403, permissionDeniedMessage(...missing)));
    }
    next();
  };
}
