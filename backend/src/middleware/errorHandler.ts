import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpError } from "../utils/httpError";

/** Mongo driver / network failures that should not surface as raw `read ECONNRESET` to clients. */
function isDatabaseConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: string | number };
  const name = String(e.name || "");
  const msg = String(e.message || "");
  const code = String(e.code ?? "");
  if (
    name === "MongoServerSelectionError" ||
    name === "MongoNetworkError" ||
    name === "MongoNetworkTimeoutError" ||
    name === "MongoWaitQueueTimeoutError"
  ) {
    return true;
  }
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "ECONNREFUSED") return true;
  if (/MongoServerSelection|ReplicaSetNoPrimary|ECONNRESET|ETIMEDOUT|socket.*timed out|secureConnect.*timed out/i.test(msg)) {
    return true;
  }
  return false;
}

const DB_UNAVAILABLE_MESSAGE =
  "Cannot reach the database. If you use MongoDB Atlas, allow your current IP in Network Access and check the cluster is running. For local development, start MongoDB and set MONGODB_URI (e.g. mongodb://127.0.0.1:27017/yourdb).";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}` } });
}

function statusFromBodyParser(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { type?: unknown; status?: unknown; statusCode?: unknown };
  if (e.type === "entity.parse.failed" || e.type === "entity.too.large") {
    const s = typeof e.status === "number" ? e.status : e.statusCode;
    return typeof s === "number" ? s : 400;
  }
  return null;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Each image must be at most 5 MB" : err.message || "Upload error";
    res.status(400).json({ error: { message } });
    return;
  }
  const isHttp = err instanceof HttpError;
  const parseStatus = !isHttp ? statusFromBodyParser(err) : null;
  const isBadUploadMessage =
    err instanceof Error &&
    /Only JPEG|LIMIT_UNEXPECTED_FILE|Unexpected field|Multipart/i.test(err.message);
  const isDbDown = !isHttp && isDatabaseConnectivityError(err);
  const status = isHttp ? err.status : parseStatus ?? (isBadUploadMessage ? 400 : isDbDown ? 503 : 500);
  const message = isHttp
    ? err.message
    : parseStatus !== null
      ? "Invalid or malformed JSON body"
      : isDbDown
        ? DB_UNAVAILABLE_MESSAGE
        : err instanceof Error
          ? err.message
          : "Internal server error";
  const stack = err instanceof Error ? err.stack : undefined;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(status).json({
    error: {
      message,
      code: isHttp ? err.code : undefined,
      ...(process.env.NODE_ENV !== "production" ? { stack } : {})
    }
  });
}

