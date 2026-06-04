import type { NextFunction, Request, Response } from "express";
import sanitize from "mongo-sanitize";

export function mongoSanitize(req: Request, _res: Response, next: NextFunction) {
  req.body = sanitize(req.body);
  req.params = sanitize(req.params);
  if (req.query && typeof req.query === "object") {
    req.query = sanitize(req.query) as Request["query"];
  }
  next();
}

