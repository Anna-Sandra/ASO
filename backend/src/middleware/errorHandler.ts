import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpError } from "../utils/httpError";
import { sanitizeServerErrorMessage } from "../utils/userFacingError";

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
  "We are having trouble connecting right now. Wait a few minutes, refresh the page, and try again. If this continues, contact support.";

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    error: { message: "That page or action is not available. Check the link or try again from the home page." }
  });
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
      err.code === "LIMIT_FILE_SIZE"
        ? "Each file must be 5 MB or smaller. Choose a smaller image."
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "That upload field was not recognized. Refresh the page and try again."
          : "We could not upload that file. Try a different image.";
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
      ? "The request was not valid JSON. Check your entries and submit again."
      : isDbDown
        ? DB_UNAVAILABLE_MESSAGE
        : isBadUploadMessage
          ? "Only image files (JPEG, PNG, or WebP) are allowed, up to 5 MB each."
          : process.env.NODE_ENV === "production"
            ? sanitizeServerErrorMessage(err, status)
            : err instanceof Error
              ? err.message
              : "Something went wrong on our side. Please try again in a moment.";
  const stack = err instanceof Error ? err.stack : undefined;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  const billing =
    isHttp && err instanceof HttpError ? (err as HttpError & { billing?: unknown }).billing : undefined;

  res.status(status).json({
    error: {
      message,
      code: isHttp ? err.code : undefined,
      ...(billing ? { billing } : {}),
      ...(process.env.NODE_ENV !== "production" ? { stack } : {})
    }
  });
}

