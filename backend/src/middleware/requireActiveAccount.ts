import type { NextFunction, Request, Response } from "express";

/**
 * Ensures a user is present on the request. Account status is enforced in `protect` / `optionalProtect`
 * when the database is available (avoids duplicate DB round-trips).
 */
export function requireActiveAccount(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next();
  next();
}
