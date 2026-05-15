import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { assistantChatSchema } from "./assistant.schemas";
import type { z } from "zod";
import { Product } from "../products/product.model";
import { Business } from "../businesses/business.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";

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

/** Smaller snippets + shorter history = less prefill work on slow CPUs (see OLLAMA_NUM_CTX). */
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
    model: env.OLLAMA_MODEL || "llama3",
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

  const [settings, sampleProducts, sampleStores] = await Promise.all([
    getOrCreateSettings(),
    Product.find({ status: "active" })
      .sort({ updatedAt: -1 })
      .limit(ASSISTANT_PRODUCT_LIMIT)
      .select("_id name price category stock description tags imageUrls businessId")
      .lean(),
    Business.find({ status: "active" })
      .sort({ updatedAt: -1 })
      .limit(ASSISTANT_BUSINESS_LIMIT)
      .select("slug name businessType description tags deliveryAvailable pickupAvailable")
      .lean()
  ]);

  const siteName =
    typeof settings?.siteName === "string" && settings.siteName.trim()
      ? settings.siteName.trim()
      : "Campus Mart";

  const lines = sampleProducts.map((p) => {
    const id = (p._id as mongoose.Types.ObjectId).toString();
    const st = typeof p.stock === "number" ? p.stock : 0;
    const avail = st > 0 || p.category === "services" ? "in stock" : "oos";
    const desc =
      typeof p.description === "string" && p.description.length > ASSISTANT_DESC_CHARS
        ? `${p.description.slice(0, ASSISTANT_DESC_CHARS)}…`
        : p.description || "";
    const rawImg = Array.isArray((p as { imageUrls?: string[] }).imageUrls)
      ? (p as { imageUrls?: string[] }).imageUrls?.[0]
      : "";
    const thumb = toAbsoluteAssetUrl(typeof rawImg === "string" ? rawImg : "", apiOrigin);
    const imgSeg = thumb ? ` | thumb:${thumb}` : "";
    return `- [${id.slice(-8)}] ${String(p.name || "")} | cat:${String(p.category || "")} | GHS:${Number(p.price) || 0} | ${avail}${imgSeg} | ${desc}`;
  });

  const userNote = req.user
    ? `Shopper (${req.user.role}), signed in — mention orders/receipts when useful.`
    : `Anonymous — they can browse; account needed at checkout.`;

  const storeLines = sampleStores.map((b) => {
    const slug = typeof b.slug === "string" ? b.slug : "";
    return `- [${String(b.businessType || "")}] ${String(b.name || "")} | storefront /store/${slug} | ${String(b.description || "").slice(0, 48)}`;
  });

  const system = `You help ${siteName}, a Ghana campus marketplace. ${userNote}
Be concise and warm. Emoji OK sparingly ✨ 🛒. Short answers preferred unless they ask “explain” style questions.

Facts: only cite products/prices/stock using the listing lines below — never invent. If unsure, suggest search/filters/browse product pages.

Stores: multi-vendor businesses have their own pages at /store/{slug} (see store lines). Category hubs exist at paths like /food, /fashion, /electronics, /beauty, /groceries, /books, /services — each promotes that business type.

Images: listings may show thumb:URL. To show an image use a new line: ![name](exact URL from listing). Max 2 images per reply. No fake URLs.

Delivery: don’t promise ETAs; real status is on order screens.

Food listings (category food_drinks) are call-to-order: buyers don’t check out with a cart price for those items — they contact the seller from the listing.

Services (category services): buyers can send a booking request from the product page; sellers see it under vendor Service requests. In-app chat between buyer and seller still requires a shared order.

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
 * Public campus assistant — optional auth for personalization. Uses local Ollama when configured.
 * With `stream: true`, responds as `text/event-stream` (SSE) so the UI can show tokens as they arrive.
 */
export const postAssistantChat = asyncHandler(async (req: Request, res: Response) => {
  const { message, history, stream } = req.body as AssistantChatBody;

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
      if (!env.OLLAMA_BASE_URL.trim()) {
        const reply =
          `Hi — AI chat is idle until ops sets \`OLLAMA_BASE_URL\` for a local model (Ollama). ` +
          `Browse ${siteName} by category and search. Order help: sign in → Orders.`;
        sseWrite(res, { delta: "", reply, done: true, source: "fallback", model: null });
        return;
      }

      let full = "";
      for await (const delta of ollamaChatStream(system, msgs, ac.signal)) {
        full += delta;
        sseWrite(res, { delta, done: false });
      }
      const trimmed = full.trim();
      if (!trimmed) {
        sseWrite(res, {
          delta: "",
          reply: `${siteName}: Empty model response — try a smaller/faster Ollama model (e.g. llama3.2:1b).`,
          done: true,
          source: "ollama",
          model: env.OLLAMA_MODEL
        });
      } else {
        sseWrite(res, { delta: "", reply: trimmed, done: true, source: "ollama", model: env.OLLAMA_MODEL });
      }
    } catch (e) {
      const msg =
        e instanceof HttpError ? e.message : e instanceof Error && e.name === "AbortError" ? "Model timed out." : String(e || "unknown");
      const reply =
        `${siteName}: I could not reach the local AI (${msg}). ` +
        `**Mistral / 7B-class models on CPU often take many minutes** — use a tiny model for chat: \`ollama pull llama3.2:1b\` then set \`OLLAMA_MODEL=llama3.2:1b\`. ` +
        `GPU changes everything; without it, expect slow decoding. Replies stream so text shows as soon as the model starts.`;
      sseWrite(res, { error: msg, reply, done: true, source: "fallback" });
    } finally {
      cleanup();
      res.end();
    }
    return;
  }

  let reply: string | null = null;
  let source: "ollama" | "fallback" = "fallback";

  if (env.OLLAMA_BASE_URL.trim()) {
    try {
      reply = await ollamaCompletion(system, msgs);
      source = "ollama";
    } catch (e) {
      const msg =
        e instanceof HttpError ? e.message : e instanceof Error && e.name === "AbortError" ? "Model timed out." : String(e || "unknown");
      reply =
        `${siteName}: I could not reach the local AI (${msg}). ` +
        `Tips: **7B+ models on CPU are very slow** — try \`ollama pull llama3.2:1b\` and \`OLLAMA_MODEL=llama3.2:1b\`. ` +
        `Lower \`OLLAMA_NUM_PREDICT\` / \`OLLAMA_NUM_CTX\` in \`.env\`, or use a GPU. The app sends **stream: true** for incremental UI. ` +
        `Confirm Ollama is running and \`OLLAMA_BASE_URL\` is correct.`;
    }
  }

  if (!reply) {
    reply =
      `Hi — AI chat is idle until ops sets \`OLLAMA_BASE_URL\` on the server for a local model (free with Ollama). ` +
      `You can still browse ${siteName} by category and search bar. For order issues, sign in → Orders or Report from a receipt item.`;
  }

  res.json({
    reply,
    assistant: "campusmart",
    model: env.OLLAMA_BASE_URL.trim() ? env.OLLAMA_MODEL : null,
    source
  });
});
