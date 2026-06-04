import mongoose from "mongoose";
import { ensureBootstrapAdmin } from "./bootstrapAdmin";
import { env } from "./env";
import { PRODUCT_CATEGORIES } from "../modules/products/product.model";
import {
  BABY_LISTING_TEXT_RE,
  legacyCategorySlugMapForMigration,
  normalizeProductCategory
} from "../modules/products/productCategories";
import { PlatformSettings } from "../modules/platform/platformSettings.model";
import { Order } from "../modules/orders/order.model";

async function syncPlatformCommissionSevenToFive() {
  try {
    const r = await PlatformSettings.updateMany({ commissionPercent: 7 }, { $set: { commissionPercent: 5 } });
    if (r.modifiedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[db] Updated platform commission from 7% to 5% on ${r.modifiedCount} settings row(s)`);
    }
  } catch {
    /* collection may not exist yet */
  }
}

/** Map legacy / old slug categories to current PRODUCT_CATEGORIES (raw Mongo collections). */
async function migrateLegacyProductCategories() {
  const db = mongoose.connection.db;
  if (!db) return;

  const slugMap = legacyCategorySlugMapForMigration();

  const allowed = new Set<string>(PRODUCT_CATEGORIES);

  const normalizeCollection = async (name: string) => {
    const col = db.collection(name);
    for (const [from, to] of Object.entries(slugMap)) {
      if (from === to) continue;
      await col.updateMany({ category: from }, { $set: { category: to } });
    }
    const orphans = await col.find({ category: { $nin: [...allowed] } }).project({ category: 1 }).limit(500).toArray();
    for (const doc of orphans) {
      const raw = (doc as { category?: unknown }).category;
      const normalized = normalizeProductCategory(raw);
      const next = normalized ?? "groceries_essentials";
      if (String(raw) !== next) {
        await col.updateOne({ _id: doc._id }, { $set: { category: next } });
      }
    }
  };

  await normalizeCollection("products");
  await normalizeCollection("vendorapplications");
}

/** Vendors sometimes pick “Groceries” for baby SKUs — move obvious listings to Babies & Infants. */
async function migrateMiscategorizedBabyProducts() {
  const db = mongoose.connection.db;
  if (!db) return;
  const col = db.collection("products");
  const r = await col.updateMany(
    {
      category: { $in: ["groceries_essentials", "fashion_accessories", "beauty_personal_care"] },
      $or: [
        { name: BABY_LISTING_TEXT_RE },
        { description: BABY_LISTING_TEXT_RE },
        { listingSearchAssist: BABY_LISTING_TEXT_RE }
      ]
    },
    { $set: { category: "babies_infants" } }
  );
  if (r.modifiedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`[db] Reclassified ${r.modifiedCount} baby/infant listing(s) to babies_infants`);
  }
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

/**
 * Legacy UI allowed marking Paystack orders “refunded” without calling Paystack.
 * Real money movement is tracked via paystackRefundId; downgrade bogus rows to requested.
 */
async function migrateLegacyManualPaystackRefundFlags() {
  try {
    const r = await Order.updateMany(
      {
        paymentMethod: "paystack",
        refundStatus: "refunded",
        $or: [{ paystackRefundId: { $exists: false } }, { paystackRefundId: null }]
      },
      { $set: { refundStatus: "requested" } }
    );
    if (r.modifiedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[db] Set ${r.modifiedCount} Paystack order(s) from “refunded” (no Paystack refund id) → requested`
      );
    }
  } catch {
    /* collection may not exist yet */
  }
}

/**
 * Paystack sets `refunded` in admin only after remote `processed`. Rows marked refunded without that
 * confirmation are legacy mistakes — move back to refund_processing (sync) or requested.
 */
async function migratePaystackRefundedWithoutProcessedConfirmation() {
  try {
    const rProc = await Order.updateMany(
      {
        paymentMethod: "paystack",
        refundStatus: "refunded",
        paystackRefundRemoteStatus: { $ne: "processed" },
        paystackRefundId: { $gt: 0 }
      },
      { $set: { refundStatus: "refund_processing" } }
    );
    const rReq = await Order.updateMany(
      {
        paymentMethod: "paystack",
        refundStatus: "refunded",
        paystackRefundRemoteStatus: { $ne: "processed" },
        $or: [{ paystackRefundId: { $exists: false } }, { paystackRefundId: null }]
      },
      { $set: { refundStatus: "requested" } }
    );
    const n = rProc.modifiedCount + rReq.modifiedCount;
    if (n > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[db] Corrected ${rProc.modifiedCount} Paystack order(s) (refund not processed → refund_processing), ` +
          `${rReq.modifiedCount} (→ requested)`
      );
    }
  } catch {
    /* collection may not exist yet */
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

async function migrateConversationKindAndIndex() {
  const db = mongoose.connection.db;
  if (!db) return;
  const col = db.collection("conversations");
  try {
    await col.updateMany({ kind: { $exists: false } }, { $set: { kind: "order" } });
  } catch {
    /* collection may not exist */
  }
  try {
    await col.dropIndex("buyerId_1_sellerId_1");
  } catch {
    /* already migrated or different name */
  }
  try {
    await col.createIndex({ buyerId: 1, sellerId: 1, kind: 1 }, { unique: true, name: "buyerId_1_sellerId_1_kind_1" });
  } catch {
    /* may already exist */
  }
}

export async function connectDb() {
  mongoose.set("strictQuery", true);
  // Do not enable sanitizeFilter globally — it wraps $gt/$lt in $eq and breaks valid
  // server-side queries (e.g. Token expiresAt: { $gt: new Date() }). Request injection
  // is handled by mongo-sanitize middleware + Zod on inputs.
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 12_000,
    connectTimeoutMS: 12_000
  });
  await migrateConversationKindAndIndex();
  await migrateLegacyProductCategories();
  await migrateMiscategorizedBabyProducts();
  await migrateLegacyManualPaystackRefundFlags();
  await migratePaystackRefundedWithoutProcessedConfirmation();
  await syncPlatformCommissionSevenToFive();
  await backfillActiveZeroStockIfSmallCatalog();
  await ensureUserContactIndexes();
  await ensureBootstrapAdmin();
}
