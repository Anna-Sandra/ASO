/**
 * Bulk-upload local files under backend/uploads to Cloudinary and rewrite URLs in MongoDB.
 *
 * Prerequisites (backend/.env):
 *   MONGODB_URI=...
 *   CLOUDINARY_CLOUD_NAME=...
 *   CLOUDINARY_API_KEY=...
 *   CLOUDINARY_API_SECRET=...
 *
 * From backend/:
 *   node migrateImages.js
 *
 * Optional:
 *   MIGRATE_IMAGES_DRY_RUN=1   — log actions only, no uploads or DB writes
 *   MIGRATE_IMAGES_SKIP=users  — comma list: products,businesses,users,riders (skip sections)
 *
 * Never commit API secrets or Mongo credentials into this file.
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { MongoClient } = require("mongodb");
const cloudinary = require("cloudinary").v2;

const URI = process.env.MONGODB_URI;
const UPLOADS_ROOT = path.join(__dirname, "uploads");
const DRY = String(process.env.MIGRATE_IMAGES_DRY_RUN || "").trim() === "1";
const SKIP = new Set(
  String(process.env.MIGRATE_IMAGES_SKIP || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
const CLOUD_KEY = (process.env.CLOUDINARY_API_KEY || "").trim();
const CLOUD_SECRET = (process.env.CLOUDINARY_API_SECRET || "").trim();

function isCloudinaryUrl(u) {
  return typeof u === "string" && u.includes("res.cloudinary.com");
}

/** Relative path under `uploads/` e.g. `products/uuid.jpg` */
function uploadsRelativeFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    const m = String(u.pathname || "").match(/\/uploads\/(.+)$/i);
    return m ? m[1].replace(/^\/+/, "") : null;
  } catch {
    const m = String(url).match(/\/uploads\/(.+)$/i);
    return m ? m[1].replace(/^\/+/, "") : null;
  }
}

function localFilePath(rel) {
  if (!rel) return null;
  const clean = rel.replace(/^[/\\]+/, "");
  const full = path.join(UPLOADS_ROOT, clean);
  if (!full.startsWith(UPLOADS_ROOT)) return null;
  return full;
}

function cloudinaryFolderFromRel(rel) {
  const first = rel.split(/[/\\]/)[0] || "misc";
  return `shopiqgh/${first}`;
}

async function uploadLocalFile(localPath, relForFolder) {
  const folder = cloudinaryFolderFromRel(relForFolder);
  const result = await cloudinary.uploader.upload(localPath, {
    folder,
    resource_type: "auto",
    use_filename: false,
    unique_filename: true
  });
  return result.secure_url;
}

async function migrateProducts(db) {
  if (SKIP.has("products")) {
    console.log("[products] skipped");
    return;
  }
  const coll = db.collection("products");
  const cursor = coll.find({
    imageUrls: { $exists: true, $ne: [] }
  });

  let updated = 0;
  for await (const product of cursor) {
    const urls = Array.isArray(product.imageUrls) ? product.imageUrls : [];
    let changed = false;
    const newUrls = [];

    for (const url of urls) {
      if (isCloudinaryUrl(url) || !/^https?:\/\//i.test(String(url))) {
        newUrls.push(url);
        continue;
      }
      const rel = uploadsRelativeFromUrl(url);
      const localPath = rel ? localFilePath(rel) : null;
      if (!localPath || !fs.existsSync(localPath)) {
        if (rel) console.warn(`  [products] missing file: ${rel} (${product._id})`);
        newUrls.push(url);
        continue;
      }

      let nextUrl = url;
      if (!DRY) {
        try {
          nextUrl = await uploadLocalFile(localPath, rel);
          changed = true;
          console.log(`  [products] uploaded ${rel} -> cloudinary`);
        } catch (e) {
          console.error(`  [products] upload failed ${rel}:`, e.message || e);
          newUrls.push(url);
          continue;
        }
      } else {
        console.log(`  [dry-run] would upload ${rel}`);
        changed = true;
      }
      newUrls.push(nextUrl);
    }

    if (changed && !DRY) {
      await coll.updateOne({ _id: product._id }, { $set: { imageUrls: newUrls } });
      updated += 1;
      console.log(`  [products] updated ${String(product.name || product._id).slice(0, 60)}`);
    }
  }
  console.log(`[products] done; documents touched: ${updated}${DRY ? " (dry-run)" : ""}`);
}

async function migrateBusinessUrls(db) {
  if (SKIP.has("businesses")) {
    console.log("[businesses] skipped");
    return;
  }
  const coll = db.collection("businesses");
  for (const field of ["logoUrl", "bannerUrl"]) {
    const cursor = coll.find({
      [field]: { $type: "string", $regex: "^https?://", $not: /res\.cloudinary\.com/ }
    });

    for await (const doc of cursor) {
      const url = doc[field];
      if (isCloudinaryUrl(url)) continue;
      const rel = uploadsRelativeFromUrl(url);
      const localPath = rel ? localFilePath(rel) : null;
      if (!localPath || !fs.existsSync(localPath)) {
        if (rel) console.warn(`  [businesses.${field}] missing file: ${rel} (${doc._id})`);
        continue;
      }

      if (DRY) {
        console.log(`  [dry-run] would upload ${field} ${rel}`);
        continue;
      }
      try {
        const next = await uploadLocalFile(localPath, rel);
        await coll.updateOne({ _id: doc._id }, { $set: { [field]: next } });
        console.log(`  [businesses] ${field} ${String(doc.name || doc._id).slice(0, 50)}`);
      } catch (e) {
        console.error(`  [businesses] upload failed ${rel}:`, e.message || e);
      }
    }
  }
}

async function migrateUsers(db) {
  if (SKIP.has("users")) {
    console.log("[users] skipped");
    return;
  }
  const coll = db.collection("users");
  const cursor = coll.find({
    profileImageUrl: { $type: "string", $regex: "^https?://", $not: /res\.cloudinary\.com/ }
  });

  for await (const doc of cursor) {
    const url = doc.profileImageUrl;
    if (isCloudinaryUrl(url)) continue;
    const rel = uploadsRelativeFromUrl(url);
    const localPath = rel ? localFilePath(rel) : null;
    if (!localPath || !fs.existsSync(localPath)) {
      if (rel) console.warn(`  [users] missing avatar file: ${rel} (${doc._id})`);
      continue;
    }

    if (DRY) {
      console.log(`  [dry-run] would upload avatar ${rel}`);
      continue;
    }
    try {
      const next = await uploadLocalFile(localPath, rel);
      await coll.updateOne({ _id: doc._id }, { $set: { profileImageUrl: next } });
      console.log(`  [users] avatar ${doc.email || doc._id}`);
    } catch (e) {
      console.error(`  [users] upload failed ${rel}:`, e.message || e);
    }
  }
}

async function migrateRiders(db) {
  if (SKIP.has("riders")) {
    console.log("[riders] skipped");
    return;
  }
  const coll = db.collection("riderprofiles");
  const cursor = coll.find({
    photoUrl: { $type: "string", $regex: "^https?://", $not: /res\.cloudinary\.com/ }
  });

  for await (const doc of cursor) {
    const url = doc.photoUrl;
    if (!url || isCloudinaryUrl(url)) continue;
    const rel = uploadsRelativeFromUrl(url);
    const localPath = rel ? localFilePath(rel) : null;
    if (!localPath || !fs.existsSync(localPath)) {
      if (rel) console.warn(`  [riders] missing photo: ${rel} (${doc._id})`);
      continue;
    }

    if (DRY) {
      console.log(`  [dry-run] would upload rider photo ${rel}`);
      continue;
    }
    try {
      const next = await uploadLocalFile(localPath, rel);
      await coll.updateOne({ _id: doc._id }, { $set: { photoUrl: next } });
      console.log(`  [riders] photo ${doc._id}`);
    } catch (e) {
      console.error(`  [riders] upload failed ${rel}:`, e.message || e);
    }
  }
}

async function main() {
  if (!URI) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  if (!CLOUD_NAME || !CLOUD_KEY || !CLOUD_SECRET) {
    console.error("Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in backend/.env");
    process.exit(1);
  }
  if (!fs.existsSync(UPLOADS_ROOT)) {
    console.error(`Uploads directory not found: ${UPLOADS_ROOT}`);
    process.exit(1);
  }

  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: CLOUD_KEY,
    api_secret: CLOUD_SECRET,
    secure: true
  });

  console.log(`Uploads: ${UPLOADS_ROOT}`);
  if (DRY) console.log("DRY RUN — no uploads or DB updates");

  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db();

  await migrateProducts(db);
  await migrateBusinessUrls(db);
  await migrateUsers(db);
  await migrateRiders(db);

  await client.close();
  console.log("Migration finished.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
