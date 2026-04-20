import mongoose from "mongoose";
import { env } from "./env";

/** Map legacy shop categories to current PRODUCT_CATEGORIES (raw collection). */
async function migrateLegacyProductCategories() {
  const db = mongoose.connection.db;
  if (!db) return;
  const col = db.collection("products");
  const map: Record<string, string> = {
    coffee: "food",
    beans: "food",
    snacks: "food",
    gear: "electronics",
    mugs: "other",
    materials: "clothing",
    equipment: "electronics",
    food: "food"
  };
  for (const [from, to] of Object.entries(map)) {
    await col.updateMany({ category: from }, { $set: { category: to } });
  }
  const allowed = new Set(["electronics", "books", "clothing", "food", "footwears", "other"]);
  await col.updateMany({ category: { $nin: [...allowed] } }, { $set: { category: "other" } });
}

/**
 * Vendors often publish with stock 0 (schema default was 0); active listings with no stock cannot be bought.
 * For small catalogs (typical dev/demo), bump zero stock so the storefront is usable.
 */
async function backfillActiveZeroStockIfSmallCatalog() {
  const db = mongoose.connection.db;
  if (!db) return;
  const col = db.collection("products");
  const n = await col.countDocuments();
  if (n > 200) return;
  const r = await col.updateMany({ status: "active", stock: { $lte: 0 } }, { $set: { stock: 30 } });
  if (r.modifiedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`[db] Set stock to 30 for ${r.modifiedCount} active products with zero stock (catalog size ${n})`);
  }
}

async function ensureUserContactIndexes() {
  const db = mongoose.connection.db;
  if (!db) return;
  const users = db.collection("users");
  const indexes = await users.indexes();
  const emailIdx = indexes.find((i) => i.name === "email_1");
  const phoneIdx = indexes.find((i) => i.name === "phone_1");

  const emailNeedsReset = !!emailIdx && emailIdx.unique && !emailIdx.sparse && !emailIdx.partialFilterExpression;
  const phoneNeedsReset = !!phoneIdx && phoneIdx.unique && !phoneIdx.sparse && !phoneIdx.partialFilterExpression;

  if (emailNeedsReset) await users.dropIndex("email_1");
  if (phoneNeedsReset) await users.dropIndex("phone_1");
  // Legacy data may contain empty-string/null contact fields; normalize before unique indexes.
  await users.updateMany({ email: { $in: ["", null] } }, { $unset: { email: "" } });
  await users.updateMany({ phone: { $in: ["", null] } }, { $unset: { phone: "" } });

  await users.createIndex({ email: 1 }, { name: "email_1", unique: true, sparse: true });
  await users.createIndex({ phone: 1 }, { name: "phone_1", unique: true, sparse: true });
}

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI);
  await migrateLegacyProductCategories();
  await backfillActiveZeroStockIfSmallCatalog();
  await ensureUserContactIndexes();
}

