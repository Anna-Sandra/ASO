import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";

const BLOCKED_METHODS = new Set(["TRACE", "TRACK", "CONNECT"]);

const SUSPICIOUS_PATH =
  /(\.\.|%2e%2e|%252e|%00|\\x00|\/etc\/passwd|\/proc\/|<script|javascript:)/i;

/** Lightweight WAF-style checks before route handlers (not a replacement for a CDN WAF). */
export function requestSecurity(req: Request, res: Response, next: NextFunction) {
  if (BLOCKED_METHODS.has(req.method.toUpperCase())) {
    return next(new HttpError(405, "Method not allowed"));
  }

  const rawPath = String(req.path || req.url || "");
  if (SUSPICIOUS_PATH.test(rawPath) || rawPath.includes("\0")) {
    return next(new HttpError(400, "Invalid request"));
  }

  const urlLen = String(req.originalUrl || "").length;
  if (urlLen > 12_000) {
    return next(new HttpError(414, "Request URI too long"));
  }

  const contentLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > 2 * 1024 * 1024) {
    return next(new HttpError(413, "Payload too large"));
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
}
