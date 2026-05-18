import { env } from "./env";

/** Load the chat model into RAM once so the first shopper message is not a multi-minute cold start. */
export function warmupOllamaInBackground(): void {
  const base = env.OLLAMA_BASE_URL.trim();
  if (!base) return;
  const model = env.OLLAMA_MODEL || "llama3.2:3b";
  const url = `${base.replace(/\/$/, "")}/api/chat`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: "15m",
      messages: [{ role: "user", content: "hi" }],
      options: { num_predict: 1, num_ctx: env.OLLAMA_NUM_CTX }
    })
  })
    .then((res) => {
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[assistant] Ollama warmup failed (HTTP ${res.status}). Is \`${model}\` pulled?`);
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`[assistant] Ollama warmed up (${model}).`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[assistant] Ollama warmup failed — is Ollama running?", err instanceof Error ? err.message : err);
    });
}
