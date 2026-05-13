import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { assistantChatSchema } from "./assistant.schemas";
import type { z } from "zod";
import { Product } from "../products/product.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";

type AssistantChatBody = z.infer<typeof assistantChatSchema>;

type OllamaChatResponse = {
  message?: { content?: string };
  error?: string;
};

async function ollamaCompletion(system: string, userMessages: Array<{ role: "user" | "assistant"; content: string }>) {
  const base = env.OLLAMA_BASE_URL.trim();
  if (!base) return null;

  const url = `${base.replace(/\/$/, "")}/api/chat`;
  const body = JSON.stringify({
    model: env.OLLAMA_MODEL || "llama3",
    stream: false,
    messages: [{ role: "system", content: system }, ...userMessages.filter((m) => m.role && m.content)]
  });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
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

/**
 * Public campus assistant — optional auth for personalization. Uses local Ollama when configured.
 * Request body is validated by `validateBody(assistantChatSchema)` on the app in {@link createApp}.
 */
export const postAssistantChat = asyncHandler(async (req: Request, res: Response) => {
  const { message, history } = req.body as AssistantChatBody;

  const settings = await getOrCreateSettings();
  const siteName =
    typeof settings?.siteName === "string" && settings.siteName.trim()
      ? settings.siteName.trim()
      : "Campus Mart";

  const sampleProducts = await Product.find({ status: "active" })
    .sort({ updatedAt: -1 })
    .limit(35)
    .select("_id name price category stock description tags")
    .lean();

  const lines = sampleProducts.map((p) => {
    const id = (p._id as mongoose.Types.ObjectId).toString();
    const st = typeof p.stock === "number" ? p.stock : 0;
    const avail = st > 0 || p.category === "services" ? "in stock / orderable" : "out of stock";
    const desc =
      typeof p.description === "string" && p.description.length > 220
        ? `${p.description.slice(0, 220)}…`
        : p.description || "";
    return `- [${id.slice(-8)}] ${String(p.name || "")} | ${String(p.category || "")} | GHS ${Number(p.price) || 0} | ${avail} | ${desc}`;
  });

  const userNote = req.user
    ? `Signed-in shopper (role=${req.user.role}, id suffix ${req.user.id.slice(-8)}). Be concise and helpful.`
    : "Anonymous visitor browsing the storefront.";

  const system = `You are the ${siteName} shopping assistant inside a Ghana campus marketplace.
${userNote}
Use ONLY the product facts below plus general shopping etiquette — do not invent products, prices, or policies.
Prefer suggesting items by name + short reason (price/value, ratings if mentioned elsewhere, campus delivery note from site).
If unsure, invite the user to use search and category filters.

Sample active listings (truncated descriptions):
${lines.join("\n")}

Brief rules for delivery: some listings may support campus courier; tell users to trust order pages and receipts for authoritative status.`;

  const msgs: Array<{ role: "user" | "assistant"; content: string }> = [...history.slice(-14), { role: "user", content: message }];

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
        `Tips: install a model first, e.g. \`ollama pull llama3\` or \`ollama pull llama3.2\`, then set \`OLLAMA_MODEL\` in \`.env\` to the exact name from \`ollama list\` (defaults to llama3). ` +
        `Confirm Ollama is running (\`ollama serve\` or the Ollama app) and \`OLLAMA_BASE_URL\` matches it (e.g. http://127.0.0.1:11434). Browse products with categories and price filters meanwhile.`;
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
