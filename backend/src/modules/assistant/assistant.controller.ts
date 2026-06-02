import type { Request, Response } from "express";
import mongoose from "mongoose";
import { DEFAULT_SITE_NAME } from "../../config/brand";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { assistantChatSchema } from "./assistant.schemas";
import type { z } from "zod";
import { Product } from "../products/product.model";
import { Business } from "../businesses/business.model";
import { BuyerProductView } from "../products/buyerProductView.model";
import { ProductSave } from "../products/productSave.model";
import { Order } from "../orders/order.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";
import {
  assistantConversationalToneRules,
  buildAssistantCatalogReply,
  formatProductLine,
  shouldUseNoCategoryFallback
} from "./assistantFallback";
import { queryLabelFromMessage, searchProductsForAssistant, searchSimilarProductsForAssistant } from "./assistantSearch";
import { groqConfigured } from "./groqChat";

function resolvePublicApiOrigin(): string {
  const raw = env.API_PUBLIC_ORIGIN?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* fall through */
    }
  }
  return `http://localhost:${env.PORT}`;
}

function toAbsoluteAssetUrl(pathOrUrl: string | undefined | null, apiOrigin: string): string | null {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return null;
  const t = pathOrUrl.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const p = t.startsWith("/") ? t : `/${t}`;
  return `${apiOrigin}${p}`;
}

/** Human labels for category codes — keep aligned with buyer marketplace chips. */
const SHOPPER_CAT_LABEL: Record<string, string> = {
  food_drinks: "Food & Drinks",
  fashion_accessories: "Fashion & Accessories",
  electronics_gadgets: "Electronics & Gadgets",
  beauty_personal_care: "Beauty & Personal Care",
  babies_infants: "Babies & Infants",
  services: "Services",
  books_academic: "Books & Academics",
  groceries_essentials: "Groceries & Essentials"
};

async function shopperPersonalizationNarrative(req: Request): Promise<string> {
  if (req.user?.role !== "buyer" || !req.user?.id || !mongoose.isValidObjectId(req.user.id)) return "";
  const uid = req.user.id;
  const oid = new mongoose.Types.ObjectId(uid);
  try {
    const [viewRows, saveRows, orders] = await Promise.all([
      BuyerProductView.find({ buyerId: oid }).sort({ viewedAt: -1 }).limit(12).select("productId").lean(),
      ProductSave.find({ ownerKey: `u:${uid}` }).sort({ createdAt: -1 }).limit(12).select("productId").lean(),
      Order.find({
        buyerId: oid,
        status: { $in: ["paid", "processing", "sent_for_delivery", "delivered"] }
      })
        .sort({ updatedAt: -1 })
        .limit(8)
        .select("items")
        .lean()
    ]);

    const pidSet = new Set<string>();
    for (const v of viewRows) pidSet.add(String(v.productId));
    for (const s of saveRows) pidSet.add(String(s.productId));
    for (const o of orders as { items?: { productId?: unknown }[] }[]) {
      for (const it of o.items || []) {
        const pid =
          it.productId instanceof mongoose.Types.ObjectId
            ? it.productId.toString()
            : typeof it.productId === "string" && mongoose.isValidObjectId(it.productId)
              ? it.productId
              : "";
        if (pid) pidSet.add(pid);
      }
    }

    const ids = [...pidSet]
      .filter((id) => mongoose.isValidObjectId(id))
      .slice(0, 40)
      .map((id) => new mongoose.Types.ObjectId(id));
    if (!ids.length) return "";

    const prods = await Product.find({ _id: { $in: ids } })
      .select("name category")
      .lean();
    const byId = new Map(prods.map((p) => [p._id.toString(), p]));

    const recentNames = viewRows
      .map((v) => byId.get(String(v.productId)))
      .filter(Boolean)
      .slice(0, 6)
      .map((p) => String((p as { name?: string }).name || "").trim())
      .filter(Boolean);

    const cats = new Map<string, number>();
    for (const p of prods) {
      const c = String((p as { category?: string }).category || "");
      if (!c) continue;
      cats.set(c, (cats.get(c) ?? 0) + 1);
    }
    const topCats = [...cats.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c]) => SHOPPER_CAT_LABEL[c] || c.replace(/_/g, " "));

    const lines: string[] = [];
    if (recentNames.length) lines.push(`Recently viewed products: ${recentNames.join(", ")}`);
    if (topCats.length) lines.push(`Frequent categories in their history: ${topCats.join(", ")}`);
    if (orders.length) lines.push("They have previous paid/delivered orders — mention re-ordering when it fits.");

    if (!lines.length) return "";
    return `\nShopper personalization (use for tone and what to prioritize — still ONLY cite real products from the listings below; never invent items):\n- ${lines.join("\n- ")}\n`;
  } catch {
    return "";
  }
}

type AssistantChatBody = z.infer<typeof assistantChatSchema>;

type OllamaChatResponse = {
  message?: { content?: string };
  error?: string;
};

type OllamaStreamLine = {
  message?: { role?: string; content?: string };
  done?: boolean;
  error?: string;
};

/** Snippets + history sized for OLLAMA_NUM_CTX (default 1024); shrink ASSISTANT_* limits if you lower ctx. */
const ASSISTANT_PRODUCT_LIMIT = 10;
const ASSISTANT_BUSINESS_LIMIT = 4;
const ASSISTANT_DESC_CHARS = 36;
const HISTORY_LEN = 4;

/** Ollama /api/chat options tuned for responsiveness on CPU-class hardware */
function ollamaOptionsPayload() {
  const opts: Record<string, number> = {
    num_predict: env.OLLAMA_NUM_PREDICT,
    num_ctx: env.OLLAMA_NUM_CTX,
    temperature: env.OLLAMA_TEMPERATURE,
    top_k: 35,
    top_p: 0.92,
    repeat_penalty: 1.05
  };
  const nt = Number(env.OLLAMA_NUM_THREAD ?? 0);
  if (nt > 0) opts.num_thread = nt;
  return {
    model: env.OLLAMA_MODEL || "llama3.2:3b",
    keep_alive: "15m",
    options: opts
  };
}

async function loadAssistantPrompt(
  req: Request,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{
  siteName: string;
  system: string;
  msgs: Array<{ role: "user" | "assistant"; content: string }>;
}> {
  const apiOrigin = resolvePublicApiOrigin();
  const appOrigin = env.APP_ORIGIN.replace(/\/$/, "");

  const strictListings = shouldUseNoCategoryFallback(String(message || "").trim());
  let listingsAreSimilar = false;
  let sampleProducts = await searchProductsForAssistant(message, ASSISTANT_PRODUCT_LIMIT);
  if (strictListings && sampleProducts.length === 0) {
    const similar = await searchSimilarProductsForAssistant(message, ASSISTANT_PRODUCT_LIMIT);
    if (similar.length > 0) {
      sampleProducts = similar;
      listingsAreSimilar = true;
    }
  }
  const [settings, sampleStores] = await Promise.all([
    getOrCreateSettings(),
    Business.find({ status: "active" })
      .sort({ updatedAt: -1 })
      .limit(ASSISTANT_BUSINESS_LIMIT)
      .select("slug name businessType description tags deliveryAvailable pickupAvailable")
      .lean()
  ]);

  const siteName =
    typeof settings?.siteName === "string" && settings.siteName.trim()
      ? settings.siteName.trim()
      : DEFAULT_SITE_NAME;

  const lines = sampleProducts.map((p) => {
    const name = String(p.name || "Item").trim() || "Item";
    const desc =
      typeof p.description === "string" && p.description.length > ASSISTANT_DESC_CHARS
        ? `${p.description.slice(0, ASSISTANT_DESC_CHARS)}…`
        : String(p.description || "");
    const rawImg = Array.isArray(p.imageUrls) ? p.imageUrls?.[0] : "";
    const thumb = toAbsoluteAssetUrl(typeof rawImg === "string" ? rawImg : "", apiOrigin);
    const main = formatProductLine(
      p as Record<string, unknown> & { store?: { name?: string; slug?: string } },
      appOrigin
    );
    const bits: string[] = [main];
    if (thumb) bits.push(`  Photo for replies: ![${name}](${thumb})`);
    if (desc.trim()) bits.push(`  Short context: ${desc.trim()}`);
    return bits.join("\n");
  });

  const userNote = req.user
    ? `Shopper (${req.user.role}), signed in — mention orders/receipts when useful.`
    : `Guest or signed-out shopper — they can browse, tap Buy on priced products without an account, use Cart, and check out as a guest (email, phone + Paystack). Signing in is optional (order history, some messaging). Do not say login is required for cart or checkout unless you mean a specific flow (e.g. service inquiry form).`;

  const personalizeBlock = await shopperPersonalizationNarrative(req);

  const storeLines = sampleStores.map((b) => {
    const slug = typeof b.slug === "string" ? b.slug.trim() : "";
    const name = String(b.name || "Store").trim();
    const blurb = String(b.description || "").slice(0, 48);
    if (!slug) return `- ${name} (${String(b.businessType || "")})${blurb ? ` — ${blurb}` : ""}`;
    return `- [${name}](${appOrigin}/store/${encodeURIComponent(slug)}) — ${String(b.businessType || "store")}${blurb ? ` · ${blurb}` : ""}`;
  });

  const queryLabel = queryLabelFromMessage(message);

  const factsNoMatch =
    strictListings && lines.length === 0
      ? `- **No listing lines below** for **${queryLabel || "what they asked"}**. Say warmly that you couldn't find it right now (avoid "I don't see…" every time). Suggest relevant alternatives: Food → browse /food or similar dishes; Fashion → similar styles or colors; never invent listings. Do NOT append checkout/Paystack steps unless they asked how to pay.\n`
      : "";

  const searchIntel =
    lines.length > 0
      ? listingsAreSimilar
        ? `- **Similar only** — no exact **${queryLabel || "match"}**. Open with something like "I couldn't find any [item] right now, but here are similar styles/options" then list the lines below. Do NOT claim they are the exact item.\n- For fashion + color (e.g. green jeans), you may suggest olive, khaki, army green, or dark denim after the listings.\n- NEVER show food when they asked for fashion (or vice versa).\n`
        : `- Listings below match their search — introduce naturally ("Here are some options…") and show relevant lines first.\n- NEVER show food when they asked for fashion (or vice versa).\n`
      : "";

  const system = `You are the ${siteName} shopping assistant — a Ghana marketplace platform (Accra, Kumasi, campuses, and nationwide). ${userNote}${personalizeBlock}

LANGUAGE:
- Shoppers may write in English, Ghana Pidgin, or simple Twi (especially for food). Understand intent; reply in friendly English with optional brief local warmth (e.g. "Ei!" or "Chale") — do not pretend to be fluent Twi if listings are in English
- MoMo and Paystack checkout are normal for Ghana buyers — mention them when explaining payment

${assistantConversationalToneRules()}

IDENTITY:
- You represent the WHOLE ${siteName} marketplace, NOT any single store, brand, or vendor
- You are NOT a general-purpose AI assistant. You are ONLY ${siteName}’s shopping assistant
- NEVER say you are a "large language model", "AI model", or that you cannot provide meals or physical goods
- NEVER speak as a store, seller, or single shop (e.g. never "I am a clothing store"); you are the platform assistant
- When asked what the platform sells, list ALL categories: food & drinks, fashion, electronics, beauty, groceries, books, and services

BEHAVIOUR:
- If the message is only a short greeting (hi, hello, hey, good morning), reply warmly and ask what they're looking for — do NOT push products immediately
- For hunger/food/eating intent: when food listing lines exist below, show 2–3 right away, then one short follow-up. When **no** food lines below, apologize briefly and suggest /food or similar dishes (jollof, waakye, noodles, etc.) — do not invent dishes or list unrelated categories

FORMATTING RULES — follow exactly:
- Format each food item like: "🍽️ [Item Name](full-https-url) at [Store Name](full-store-https-url) · buy"
- Format priced products like: "[Item Name](full-https-url) at [Store Name](full-store-https-url) · GHS 123" — one line per item, no bullet dashes, no line breaks inside a listing
- NEVER output raw pipe-separated data like "| food_drinks | call-to-order | ok" or internal tables
- NEVER show internal fields (category codes, stock codes, availability flags) — use plain shopper wording
- Store and product links must be full markdown links [Name](https://…); copy them from the listings — never paste bare paths like /store/slug
- When mentioning products, copy markdown from the listings below; never output raw hex IDs or placeholders

PRICING RULES — CRITICAL:
- Food & drinks (food_drinks) NEVER have a cart price online — ALWAYS end the line with "buy". NEVER show "GHS …" or any price for food, even if you imagine one. Buyers contact the seller from the listing page
- Services ALWAYS say "request a quote" — never a fixed GHS checkout price unless the listing line shows quote terminology
- ONLY ordinary physical products (not food_drinks, not services) may show a GHS price, and only when it appears in the listing lines below

SEARCH INTELLIGENCE:
${searchIntel}
FACTS:
${factsNoMatch}- Only cite products using the listing lines below — never invent items or prices
- Guest checkout: shoppers can tap Buy and pay without logging in; checkout asks for email and phone. Never tell users they must sign in for cart or Paystack checkout for normal products
- How to pay (priced products): when asked, use clear numbered steps with emoji cues if you like (e.g. 🛒 Buy → 🧺 Cart → 📋 Checkout with email/phone as guest → 💳 Paystack). The Buy button adds the item to the cart. Then mention 🍽️ call-to-order food (Place Order / seller on listing) and 📩 services (Send request / quote) when relevant
- If unsure, suggest search or category hubs
- Always include the restaurant/store link when present in a listing line

CONTACT / VENDOR QUESTIONS:
- If the user asks **how to contact the seller**, **phone**, **WhatsApp**, or **where is the vendor**: say **email or contact** on the listing when shown; full payout wallet numbers are **not** shown to shoppers — payments go through checkout. Food: buy from the listing; **Messages** may require an account

CRITICAL — food & local dishes (catalog only):
- When asked about food, local dishes, Ghanaian/regional dishes, or similar, ALWAYS show real listings from the "Listings (partial)" lines below with full markdown links (🍽️ line + store link + buy)
- NEVER describe dishes from general knowledge without a listing link from below. If a dish exists in those listings, show that link. If nothing matches, say so briefly and suggest Food & drinks or search — do not answer from cookbook trivia

Stores: each food item belongs to a restaurant; storefront URLs appear in the listing lines (use those full links). Category hubs (navigation hints): /food, /fashion, /electronics, /beauty, /groceries, /books, /services

Images: NEVER output "img:", "img:URL", or raw image URLs as plain text. Format images only as ![product name](full-url), using a "Photo for replies" line when present. Maximum 1 image per reply. If unsure, skip the image entirely. Copy URLs in full — do not truncate

Delivery: don’t promise ETAs; real status is on order screens.

Food and services: buyers place requests from the product page; vendor follow-up happens there and in service workflows. In-app chat between buyer and seller may require a shared order where applicable.

Stores (partial):
${storeLines.join("\n")}

Listings (partial):
${lines.join("\n")}`;

  const msgs: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history.slice(-HISTORY_LEN),
    { role: "user", content: message }
  ];

  return { siteName, system, msgs };
}

function primaryAssistantLlm(): "groq" | "ollama" | null {
  if (groqConfigured()) return "groq";
  if (env.OLLAMA_BASE_URL.trim()) return "ollama";
  return null;
}

/**
 * Which LLM the shopping assistant will use (no secrets). Lets you verify `GROQ_API_KEY` is loaded after deploy or `.env` change.
 */
export const getAssistantLlmStatus = asyncHandler(async (_req: Request, res: Response) => {
  const primary = primaryAssistantLlm();
  res.json({
    primary,
    groq: {
      configured: groqConfigured(),
      model: env.GROQ_MODEL
    },
    ollama: {
      configured: Boolean(env.OLLAMA_BASE_URL.trim()),
      model: env.OLLAMA_MODEL
    },
    hint:
      "Shopping assistant chat uses live catalog search only (real listings). Groq/Ollama are not used for product replies — avoids invented items."
  });
});

async function ollamaCompletion(system: string, userMessages: Array<{ role: "user" | "assistant"; content: string }>) {
  const base = env.OLLAMA_BASE_URL.trim();
  if (!base) return null;

  const url = `${base.replace(/\/$/, "")}/api/chat`;
  const body = JSON.stringify({
    ...ollamaOptionsPayload(),
    stream: false,
    messages: [{ role: "system", content: system }, ...userMessages.filter((m) => m.role && m.content)]
  });

  const ctrl = new AbortController();
  const timeoutMs = env.OLLAMA_TIMEOUT_MS;
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: ctrl.signal
    });
    const data = (await res.json()) as OllamaChatResponse;
    if (!res.ok) throw new HttpError(res.status === 413 ? 413 : 502, String(data?.error || `Ollama HTTP ${res.status}`));
    const text = typeof data.message?.content === "string" ? data.message.content.trim() : "";
    if (!text) throw new HttpError(502, "Empty response from language model.");
    return text;
  } finally {
    clearTimeout(t);
  }
}

/** Handles incremental token chunks and cumulative `message.content` from Ollama. */
function nextOllamaStreamText(cumulative: { text: string }, chunk: string): string | null {
  if (!chunk) return null;
  if (cumulative.text && chunk.startsWith(cumulative.text)) {
    const d = chunk.slice(cumulative.text.length);
    cumulative.text = chunk;
    return d.length ? d : null;
  }
  if (!cumulative.text) {
    cumulative.text = chunk;
    return chunk;
  }
  cumulative.text += chunk;
  return chunk;
}

async function* ollamaChatStream(
  system: string,
  userMessages: Array<{ role: "user" | "assistant"; content: string }>,
  signal: AbortSignal
): AsyncGenerator<string, void, undefined> {
  const base = env.OLLAMA_BASE_URL.trim();
  if (!base) return;

  const url = `${base.replace(/\/$/, "")}/api/chat`;
  const body = JSON.stringify({
    ...ollamaOptionsPayload(),
    stream: true,
    messages: [{ role: "system", content: system }, ...userMessages.filter((m) => m.role && m.content)]
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal
  });

  if (!res.ok) {
    let errMsg = `Ollama HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) errMsg = j.error;
    } catch {
      try {
        errMsg = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new HttpError(502, errMsg);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new HttpError(502, "No response body from Ollama.");

  const dec = new TextDecoder();
  let buf = "";
  const cumulative = { text: "" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() || "";
    for (const line of parts) {
      const s = line.trim();
      if (!s) continue;
      let json: OllamaStreamLine;
      try {
        json = JSON.parse(s) as OllamaStreamLine;
      } catch {
        continue;
      }
      if (json.error) throw new HttpError(502, String(json.error));
      const chunk = typeof json.message?.content === "string" ? json.message.content : "";
      if (chunk) {
        const out = nextOllamaStreamText(cumulative, chunk);
        if (out) yield out;
      }
      if (json.done) return;
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      const json = JSON.parse(tail) as OllamaStreamLine;
      if (json.error) throw new HttpError(502, String(json.error));
      const chunk = typeof json.message?.content === "string" ? json.message.content : "";
      if (chunk) {
        const out = nextOllamaStreamText(cumulative, chunk);
        if (out) yield out;
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
    }
  }
}

function sseWrite(res: Response, obj: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

/**
 * Public shopping assistant — optional auth for personalization.
 * Uses **Groq** when `GROQ_API_KEY` is set; else **local Ollama** when `OLLAMA_BASE_URL` is set; else catalog fallback.
 * With `stream: true`, responds as `text/event-stream` (SSE) so the UI can show tokens as they arrive.
 */
async function resolveSiteName(): Promise<string> {
  const settings = await getOrCreateSettings();
  return typeof settings?.siteName === "string" && settings.siteName.trim()
    ? settings.siteName.trim()
    : DEFAULT_SITE_NAME;
}

export const postAssistantChat = asyncHandler(async (req: Request, res: Response) => {
  const { message, history, stream } = req.body as AssistantChatBody;
  const chatHistory = history ?? [];
  const siteName = await resolveSiteName();
  const reply = await buildAssistantCatalogReply(siteName, message, req, chatHistory);

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (res as Response & { flushHeaders?: () => void }).flushHeaders?.();
    sseWrite(res, { delta: "", reply, done: true, source: "catalog", model: null });
    res.end();
    return;
  }

  res.json({
    reply,
    assistant: "SHOPIQGH",
    model: null,
    source: "catalog"
  });
});
