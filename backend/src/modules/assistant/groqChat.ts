import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";

export type ChatMsg = { role: "user" | "assistant"; content: string };

type GroqChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export function groqConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY?.trim());
}

export async function groqCompletion(system: string, userMessages: ChatMsg[]): Promise<string | null> {
  const key = env.GROQ_API_KEY.trim();
  if (!key) return null;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL || "llama3-8b-8192",
        messages: [{ role: "system", content: system }, ...userMessages.filter((m) => m.role && m.content)],
        max_tokens: env.GROQ_MAX_TOKENS,
        temperature: env.OLLAMA_TEMPERATURE,
        stream: false
      }),
      signal: ctrl.signal
    });
    const data = (await res.json()) as GroqChatResponse;
    if (!res.ok) {
      throw new HttpError(
        res.status === 429 ? 429 : 502,
        String(data?.error?.message || `Groq HTTP ${res.status}`)
      );
    }
    const text = typeof data.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content.trim() : "";
    if (!text) throw new HttpError(502, "Empty response from Groq.");
    return text;
  } finally {
    clearTimeout(t);
  }
}

export async function* groqChatStream(
  system: string,
  userMessages: ChatMsg[],
  signal: AbortSignal
): AsyncGenerator<string, void, undefined> {
  const key = env.GROQ_API_KEY.trim();
  if (!key) return;

  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL || "llama3-8b-8192",
      messages: [{ role: "system", content: system }, ...userMessages.filter((m) => m.role && m.content)],
      max_tokens: env.GROQ_MAX_TOKENS,
      temperature: env.OLLAMA_TEMPERATURE,
      stream: true
    }),
    signal
  });

  if (!res.ok) {
    let errMsg = `Groq HTTP ${res.status}`;
    try {
      const j = (await res.json()) as GroqChatResponse;
      if (j?.error?.message) errMsg = j.error.message;
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
  if (!reader) throw new HttpError(502, "No response body from Groq.");

  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data: ")) continue;
      const payload = s.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const content = json.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content) yield content;
      } catch {
        continue;
      }
    }
  }
  const tail = buf.trim();
  if (tail.startsWith("data: ")) {
    const payload = tail.slice(6).trim();
    if (payload && payload !== "[DONE]") {
      try {
        const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const content = json.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content) yield content;
      } catch {
        /* ignore */
      }
    }
  }
}
