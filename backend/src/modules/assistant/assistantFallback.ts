import type { Request } from "express";
import mongoose from "mongoose";
import { env } from "../../config/env";
import { Product, type ProductCategory } from "../products/product.model";
import { Business } from "../businesses/business.model";
import {
  activeStoreBusinessIds,
  enrichPublicProducts,
  foodMenuStoreFilter
} from "../products/product.publicSerialize";

const FOOD_KEYWORDS =
  /\b(food|eat|eating|hungry|menu|dish|dishes|restaurant|cafeteria|canteen|waakye|banku|fufu|kenkey|jollof|lunch|dinner|breakfast|brunch|snack|order food|what.?s good)\b/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function userWantsFoodSuggestions(message: string): boolean {
  return FOOD_KEYWORDS.test(String(message || ""));
}

/** Map casual shopper language to our catalog category (narrow fallback results). */
export function detectCategoryFromMessage(message: string): ProductCategory | null {
  const m = String(message || "").toLowerCase();
  if (/shoe|heel|boot|sandal|footwear|sneaker|trainer|slipper/.test(m)) return "fashion_accessories";
  if (/food|eat|eating|hungry|menu|dish|dishes|restaurant|cafeteria|waakye|jollof|fufu|snack\b/.test(m)) return "food_drinks";
  if (/electronic|gadget|laptop|phone|charger|cable|earbud|headphone|tablet/.test(m)) return "electronics_gadgets";
  if (/beauty|makeup|skin|hair|perfume|cosmetic|lipstick/.test(m)) return "beauty_personal_care";
  if (/\bbook|novel|textbook|course ?book\b/.test(m)) return "books_academic";
  if (/service|repair|fix|tutor|plumb|electrician|hire\b/.test(m)) return "services";
  if (/grocery|groceries|vegetable|fruit\b|essentials\b/.test(m)) return "groceries_essentials";
  if (/fashion|cloth|dress|shirt|pant|skirt|bag|purse|wallet|jewelry|watch|belt|accessor/.test(m)) return "fashion_accessories";
  return null;
}

async function findProductsForFallback(message: string, limit = 6) {
  const activeIds = await activeStoreBusinessIds();
  const trimmed = String(message || "").trim();
  const detectedCategory = detectCategoryFromMessage(trimmed);

  const base: Record<string, unknown> = {
    status: "active",
    $or: [{ category: "services" }, { stock: { $gt: 0 } }, { category: "food_drinks" }],
    ...foodMenuStoreFilter(activeIds)
  };
  if (detectedCategory) {
    base.category = detectedCategory;
  }

  const preferFood = userWantsFoodSuggestions(trimmed);

  let rows: Record<string, unknown>[] = [];

  if (trimmed.length >= 2) {
    try {
      rows = (await Product.find({
        ...base,
        $text: { $search: trimmed }
      })
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean()) as unknown as Record<string, unknown>[];
    } catch {
      /* no text index or bad query */
    }
    if (!rows.length) {
      const re = new RegExp(escapeRegex(trimmed.slice(0, 80)), "i");
      rows = (await Product.find({
        ...base,
        $or: [{ name: re }, { description: re }, { tags: re }]
      })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean()) as unknown as Record<string, unknown>[];
    }
  }

  if (!rows.length) {
    const catFilter =
      detectedCategory != null
        ? {}
        : preferFood
          ? { category: "food_drinks" as const }
          : {};
    rows = (await Product.find({ ...base, ...catFilter })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()) as unknown as Record<string, unknown>[];
  }

  return enrichPublicProducts(rows);
}

function trimAppOrigin(origin: string): string {
  return String(origin || "").replace(/\/$/, "");
}

/** Markdown line for catalog/fallback replies — product and store links are always absolute (APP_ORIGIN). */
export function formatProductLine(
  p: Record<string, unknown> & { store?: { name?: string; slug?: string } },
  appOrigin: string
) {
  const origin = trimAppOrigin(appOrigin);
  const id = String(p.id || "");
  const name = String(p.name || "Item").trim() || "Item";
  const cat = String(p.category || "");
  const store = p.store;
  const storeBit =
    store?.slug && store?.name
      ? ` at [${String(store.name)}](${origin}/store/${encodeURIComponent(String(store.slug))})`
      : "";
  const price =
    cat === "food_drinks"
      ? "call to order"
      : cat === "services"
        ? "request a quote"
        : `GHS ${Number(p.price) || 0}`;
  const prefix = cat === "food_drinks" ? "🍽️ " : "";
  return `- ${prefix}[${name}](${origin}/products/${id})${storeBit} — ${price}`;
}

function isGreetingOnly(message: string): boolean {
  const t = String(message || "").trim();
  if (!t.length || t.length > 48) return false;
  if (
    /^(hi|hello|hey|hiya|howdy|sup|yo|good morning|good afternoon|good evening)\b[\s!,?.]*(there\b)?[\s!?.]*$/i.test(t)
  )
    return true;
  if (/^(what'?s up|whats up)\b[!?.]*$/i.test(t)) return true;
  return false;
}

const ORDER_HELP = /how.*(order|buy|purchase|checkout|pay)/i;

/** User-friendly reply when Ollama is down, slow, or not configured — real listings, no dev jargon. */
export async function buildAssistantCatalogReply(
  siteName: string,
  message: string,
  _req: Request
): Promise<string> {
  const trimmed = String(message || "").trim();

  if (isGreetingOnly(trimmed)) {
    return (
      `Hey! 👋 I'm your **${siteName}** shopping assistant. Ask me about food, fashion, electronics, or any products — I'll find real listings for you!`
    );
  }

  if (ORDER_HELP.test(trimmed)) {
    return (
      `Here's how to order on **${siteName}**:\n\n` +
        `**For food & services:** Open the listing and tap **Contact seller** to place your order directly.\n\n` +
        `**For other products:** Sign in → **Add to cart** → **Checkout** → pay with **Paystack**.\n\n` +
        `Need help finding something specific? Just ask! 🛒`
    );
  }

  const products = await findProductsForFallback(message, 6);
  const stores = await Business.find({ status: "active", businessType: "food_restaurant" })
    .sort({ updatedAt: -1 })
    .limit(4)
    .select("slug name")
    .lean();

  const appOrigin = trimAppOrigin(env.APP_ORIGIN);

  if (!products.length && !stores.length) {
    return (
      `I'm having trouble loading suggestions right now, but you can still browse **${siteName}** from the home page. ` +
      `Try **Food & drinks** in the menu, or use search. Sign in to track **Orders** and message sellers after you buy.`
    );
  }

  const parts: string[] = [];
  const food = userWantsFoodSuggestions(message);

  if (food) {
    parts.push(
      `Here are some **food** options on ${siteName} — each dish belongs to a restaurant; tap the name for details or the restaurant for the full menu:`
    );
  } else if (products.length) {
    parts.push(`Here are some listings on ${siteName} you can open right now:`);
  }

  if (products.length) {
    parts.push(
      "",
      ...products.map((p) =>
        formatProductLine(p as Record<string, unknown> & { store?: { name?: string; slug?: string } }, appOrigin)
      )
    );
  }

  if (food && stores.length) {
    parts.push(
      "",
      "**Restaurants & stores:**",
      ...stores.map((b) => {
        const slug = String(b.slug || "").trim();
        const name = String(b.name || "Store").trim();
        return slug
          ? `- [${name}](${appOrigin}/store/${encodeURIComponent(slug)}) — view full menu`
          : `- ${name}`;
      })
    );
  }

  parts.push(
    "",
    "Need help ordering? For **food**, open a listing and **contact the seller** to place your order. For other items, use **Add to cart** when signed in."
  );

  return parts.join("\n");
}

export async function buildAssistantIdleReply(siteName: string, message: string, req: Request): Promise<string> {
  return buildAssistantCatalogReply(siteName, message, req);
}
