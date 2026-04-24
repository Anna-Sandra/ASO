import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { HttpError } from "../utils/httpError";

/** When `ADMIN_ACCESS_SECRET` is set in .env, all `/api/admin` requests must send `X-Admin-Secret: <same>`. */
export function requireAdminEnvSecret(req: Request, _res: Response, next: NextFunction) {
  if (!env.ADMIN_ACCESS_SECRET) return next();
  const h = (req.headers["x-admin-secret"] || req.headers["x-admin-key"]) as string | undefined;
  if (h !== env.ADMIN_ACCESS_SECRET) {
    return next(new HttpError(403, "Invalid or missing admin secret header"));
  }
  next();
}
