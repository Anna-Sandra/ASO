import { env } from "../config/env";
import { isCloudinaryConfigured } from "../config/cloudinary";
import { HttpError } from "./httpError";

export type UploadStorageMode = "cloudinary" | "disk";

export function getUploadStorageMode(): UploadStorageMode {
  return isCloudinaryConfigured() ? "cloudinary" : "disk";
}

export function getUploadStorageDiagnostics(): {
  storage: UploadStorageMode;
  persistent: boolean;
  warning?: string;
} {
  const storage = getUploadStorageMode();
  const persistent = storage === "cloudinary";
  if (env.NODE_ENV === "production" && !persistent) {
    return {
      storage,
      persistent,
      warning:
        "Disk uploads on Render are erased when the instance restarts. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, redeploy, then re-upload product images."
    };
  }
  return { storage, persistent };
}

const PROD_DISK_MSG =
  "Image uploads need Cloudinary on production (Render disk is temporary). Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to the API environment, redeploy, then upload images again.";

/** Block new disk uploads in production so URLs are not saved to ephemeral Render storage. */
export function assertUploadStorageAvailable(): void {
  if (env.NODE_ENV === "production" && !isCloudinaryConfigured()) {
    throw new HttpError(503, PROD_DISK_MSG);
  }
}
