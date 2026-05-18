/**
 * One-off migration: replace a dev API origin in stored media URL strings.
 *
 * From backend/:
 *   set REPLACE_UPLOAD_URL_FROM=http://localhost:4000
 *   set REPLACE_UPLOAD_URL_TO=https://your-api.onrender.com
 *   node fixUrls.js
 *
 * Uses MONGODB_URI from backend/.env (via dotenv). Do not hardcode credentials.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { MongoClient } = require("mongodb");

const URI = process.env.MONGODB_URI;
const FROM = (process.env.REPLACE_UPLOAD_URL_FROM || "http://localhost:4000").trim();
const TO = (process.env.REPLACE_UPLOAD_URL_TO || "").trim();

async function replaceFieldWhenMatchesLocalhost(coll, field) {
  const r = await coll.updateMany({ [field]: { $regex: "localhost" } }, [
    { $set: { [field]: { $replaceAll: { input: `$${field}`, find: FROM, replacement: TO } } } }
  ]);
  return r.modifiedCount;
}

async function main() {
  if (!URI) {
    console.error("Missing MONGODB_URI (backend/.env or environment).");
    process.exit(1);
  }
  if (!TO) {
    console.error("Set REPLACE_UPLOAD_URL_TO to your public API origin (HTTPS).");
    process.exit(1);
  }
  if (FROM === TO) {
    console.error("FROM and TO must differ.");
    process.exit(1);
  }

  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db();
  const out = [];

  const products = db.collection("products");
  const pr = await products.updateMany({ imageUrls: { $elemMatch: { $regex: "localhost" } } }, [
    {
      $set: {
        imageUrls: {
          $map: {
            input: { $ifNull: ["$imageUrls", []] },
            as: "u",
            in: { $replaceAll: { input: "$$u", find: FROM, replacement: TO } }
          }
        }
      }
    }
  ]);
  if (pr.modifiedCount) out.push(`products.imageUrls: ${pr.modifiedCount}`);

  const businesses = db.collection("businesses");
  for (const f of ["logoUrl", "bannerUrl"]) {
    const n = await replaceFieldWhenMatchesLocalhost(businesses, f);
    if (n) out.push(`businesses.${f}: ${n}`);
  }

  const users = db.collection("users");
  const ur = await replaceFieldWhenMatchesLocalhost(users, "profileImageUrl");
  if (ur) out.push(`users.profileImageUrl: ${ur}`);

  const riders = db.collection("riderprofiles");
  const rr = await replaceFieldWhenMatchesLocalhost(riders, "photoUrl");
  if (rr) out.push(`riderprofiles.photoUrl: ${rr}`);

  const reports = db.collection("reports");
  const rep = await reports.updateMany({ evidenceUrls: { $elemMatch: { $regex: "localhost" } } }, [
    {
      $set: {
        evidenceUrls: {
          $map: {
            input: { $ifNull: ["$evidenceUrls", []] },
            as: "u",
            in: { $replaceAll: { input: "$$u", find: FROM, replacement: TO } }
          }
        }
      }
    }
  ]);
  if (rep.modifiedCount) out.push(`reports.evidenceUrls: ${rep.modifiedCount}`);

  await client.close();

  if (out.length) console.log(out.join("\n"));
  else console.log("No matching documents (no localhost URLs in known fields).");
  console.log("Done:", FROM, "→", TO);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
