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
import { activeStoreBusinessIds, enrichPublicProducts, foodMenuStoreFilter } from "../products/product.publicSerialize";
import { buildAssistantCatalogReply, buildAssistantIdleReply, formatProductLine } from "./assistantFallback";
import { groqChatStream, groqCompletion, groqConfigured } from "./groqChat";

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
  services: "Services",
  books_academic: "Books & Academic Materials",
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
const ASSISTANT_PRODUCT_LIMIT = 5;
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

  const activeIds = await activeStoreBusinessIds();
  const [settings, sampleProductsRaw, sampleStores] = await Promise.all([
    getOrCreateSettings(),
    Product.find({
      status: "active",
      $or: [{ category: "services" }, { stock: { $gt: 0 } }, { category: "food_drinks" }],
      ...foodMenuStoreFilter(activeIds)
    })
      .sort({ updatedAt: -1 })
      .limit(ASSISTANT_PRODUCT_LIMIT)
      .select("_id sellerId name price category stock description tags imageUrls businessId")
      .lean(),
    Business.find({ status: "active" })
      .sort({ updatedAt: -1 })
      .limit(ASSISTANT_BUSINESS_LIMIT)
      .select("slug name businessType description tags deliveryAvailable pickupAvailable")
      .lean()
  ]);

  const sampleProducts = await enrichPublicProducts(sampleProductsRaw as unknown as Record<string, unknown>[]);

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

  const system = `You are the ${siteName} shopping assistant — a Ghana marketplace platform. ${userNote}${personalizeBlock}

IDENTITY:
- You represent the WHOLE ${siteName} marketplace, NOT any single store, brand, or vendor
- You are NOT a general-purpose AI assistant. You are ONLY ${siteName}’s shopping assistant
- NEVER say you are a "large language model", "AI model", or that you cannot provide meals or physical goods
- NEVER speak as a store, seller, or single shop (e.g. never "I am a clothing store"); you are the platform assistant
- When asked what the platform sells, list ALL categories: food & drinks, fashion, electronics, beauty, groceries, books, and services

BEHAVIOUR:
- Be concise and warm. Emoji OK sparingly ✨ 🛒. Short answers unless they ask "explain" style questions
- If the message is only a short greeting (hi, hello, hey, good morning), reply warmly and introduce yourself as the ${siteName} assistant — do NOT push products or food
- For hunger/food/eating intent (hungry, "im hungry", food, lunch, dinner, snacks, etc.), ALWAYS show 2–3 relevant food listings from the catalog context below immediately, then you may ask ONE short follow-up — NEVER ask questions before showing food listings

FORMATTING RULES — follow exactly:
- Format each food item like: "🍽️ [Item Name](full-https-url) at [Store Name](full-store-https-url) — call to order"
- NEVER output raw pipe-separated data like "| food_drinks | call-to-order | ok" or internal tables
- NEVER show internal fields (category codes, stock codes, availability flags) — use plain shopper wording
- Store and product links must be full markdown links [Name](https://…); copy them from the listings — never paste bare paths like /store/slug
- When mentioning products, copy markdown from the listings below; never output raw hex IDs or placeholders

PRICING RULES — CRITICAL:
- Food & drinks (food_drinks) NEVER have a cart price online — ALWAYS end the line with "call to order". NEVER show "GHS …" or any price for food, even if you imagine one. Buyers contact the seller from the listing page
- Services ALWAYS say "request a quote" — never a fixed GHS checkout price unless the listing line shows quote terminology
- ONLY ordinary physical products (not food_drinks, not services) may show a GHS price, and only when it appears in the listing lines below

FACTS:
- Only cite products using the listing lines below — never invent items or prices
- Guest checkout: shoppers can tap Buy and pay without logging in; checkout asks for email and phone. Never tell users they must sign in for cart or Paystack checkout for normal products
- How to pay (priced products): when asked, use clear numbered steps with emoji cues if you like (e.g. 🛒 Buy → 🧺 Cart → 📋 Checkout with email/phone as guest → 💳 Paystack). The Buy button adds the item to the cart. Then mention 🍽️ call-to-order food (Place Order / seller on listing) and 📩 services (Send request / quote) when relevant
- If unsure, suggest search or category hubs
- Always include the restaurant/store link when present in a listing line

CONTACT / VENDOR QUESTIONS:
- If the user asks **how to contact the seller**, **phone**, **WhatsApp**, or **where is the vendor**: say contact/payout details appear **on each product page** (seller section); food items use **call to order** / **Place Order** from the listing; **Messages** may require a user account and an order when the platform supports it

CRITICAL — food & local dishes (catalog only):
- When asked about food, local dishes, Ghanaian/regional dishes, or similar, ALWAYS show real listings from the "Listings (partial)" lines below with full markdown links (🍽️ line + store link + call to order)
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
      primary === "groq"
        ? "Shopping assistant uses Groq Cloud (groq.com, GROQ_API_KEY). Not xAI Grok."
        : primary === "ollama"
          ? "Shopping assistant uses local Ollama. Set GROQ_API_KEY to prefer Groq Cloud instead."
          : "No remote/local LLM — assistant uses catalog fallback. Set GROQ_API_KEY or OLLAMA_BASE_URL."
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
export const postAssistantChat = asyncHandler(async (req: Request, res: Response) => {
  const { message, history, stream } = req.body as AssistantChatBody;
  const chatHistory = history ?? [];

  const { siteName, system, msgs } = await loadAssistantPrompt(req, message, history);

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), env.OLLAMA_TIMEOUT_MS);
    const onClose = () => ac.abort();
    req.on("close", onClose);

    const cleanup = () => {
      clearTimeout(t);
      req.off("close", onClose);
    };

    try {
      const llm = primaryAssistantLlm();
      if (!llm) {
        const reply = await buildAssistantIdleReply(siteName, message, req, chatHistory);
        sseWrite(res, { delta: "", reply, done: true, source: "catalog", model: null });
        return;
      }

      let full = "";
      if (llm === "groq") {
        for await (const delta of groqChatStream(system, msgs, ac.signal)) {
          full += delta;
          sseWrite(res, { delta, done: false });
        }
      } else {
        for await (const delta of ollamaChatStream(system, msgs, ac.signal)) {
          full += delta;
          sseWrite(res, { delta, done: false });
        }
      }

      const trimmed = full.trim();
      if (!trimmed) {
        const reply = await buildAssistantCatalogReply(siteName, message, req, chatHistory);
        sseWrite(res, {
          delta: "",
          reply,
          done: true,
          source: "catalog",
          model: llm === "groq" ? env.GROQ_MODEL : env.OLLAMA_MODEL
        });
      } else {
        sseWrite(res, {
          delta: "",
          reply: trimmed,
          done: true,
          source: llm,
          model: llm === "groq" ? env.GROQ_MODEL : env.OLLAMA_MODEL
        });
      }
    } catch (err) {
      console.error("[assistant] stream error:", err instanceof Error ? err.message : err);
      const reply = await buildAssistantCatalogReply(siteName, message, req, chatHistory);
      sseWrite(res, { delta: "", reply, done: true, source: "catalog", model: null });
    } finally {
      cleanup();
      res.end();
    }
    return;
  }

  let reply: string | null = null;
  let source: "groq" | "ollama" | "catalog" = "catalog";

  if (groqConfigured()) {
    try {
      reply = await groqCompletion(system, msgs);
      source = "groq";
    } catch (err) {
      console.error("[assistant] Groq completion failed:", err instanceof Error ? err.message : err);
      reply = null;
    }
  }

  if (!reply && env.OLLAMA_BASE_URL.trim()) {
    try {
      reply = await ollamaCompletion(system, msgs);
      source = "ollama";
    } catch (err) {
      console.error("[assistant] Ollama completion failed:", err instanceof Error ? err.message : err);
      reply = await buildAssistantCatalogReply(siteName, message, req, chatHistory);
      source = "catalog";
    }
  }

  if (!reply) {
    reply = await buildAssistantIdleReply(siteName, message, req, chatHistory);
    source = "catalog";
  }

  const modelId = source === "groq" ? env.GROQ_MODEL : source === "ollama" ? env.OLLAMA_MODEL : null;

  res.json({
    reply,
    assistant: "SHOPIQGH",
    model: modelId,
    source
  });
});
