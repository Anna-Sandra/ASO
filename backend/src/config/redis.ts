import { createClient, type RedisClientType } from "redis";
import { env } from "./env";

let client: RedisClientType | null = null;

export function isRedisConfigured(): boolean {
  return Boolean((env.REDIS_URL || "").trim());
}

export function getRedis(): RedisClientType | null {
  if (!client?.isOpen) return null;
  return client;
}

/** Connect once at startup; rate limits and email throttles use Redis when available. */
export async function connectRedis(): Promise<void> {
  const url = (env.REDIS_URL || "").trim();
  if (!url) {
    if (env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[security] REDIS_URL is not set — API rate limits and email throttles are per-instance only. Add Redis (e.g. Upstash) for shared limits."
      );
    }
    return;
  }
  if (client?.isOpen) return;

  client = createClient({ url });
  client.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[redis] client error:", err?.message || err);
  });
  await client.connect();
  // eslint-disable-next-line no-console
  console.log("[redis] connected — distributed rate limiting enabled");
}

export async function disconnectRedis(): Promise<void> {
  if (client?.isOpen) await client.quit();
  client = null;
}
