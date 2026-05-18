import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

const name = env.CLOUDINARY_CLOUD_NAME.trim();
const key = env.CLOUDINARY_API_KEY.trim();
const secret = env.CLOUDINARY_API_SECRET.trim();

if (name && key && secret) {
  cloudinary.config({
    cloud_name: name,
    api_key: key,
    api_secret: secret,
    secure: true
  });
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(name && key && secret);
}

export { cloudinary };
