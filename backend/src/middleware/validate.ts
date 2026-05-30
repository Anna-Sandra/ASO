import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { HttpError } from "../utils/httpError";
import { formatZodIssueMessage } from "../utils/userFacingError";

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const message = first ? formatZodIssueMessage(first) : "Please check your input and try again.";
      return next(new HttpError(400, message, "VALIDATION_ERROR"));
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const message = first ? formatZodIssueMessage(first) : "Please check your input and try again.";
      return next(new HttpError(400, message, "VALIDATION_ERROR"));
    }
    (req as Request & { validatedQuery: unknown }).validatedQuery = parsed.data;
    Object.assign(req.query, parsed.data);
    next();
  };
}

