import { getRedis } from "../config/redis";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function allowInMemory(key: string, max: number, windowMs: number): boolean {
  const k = String(key || "").trim().toLowerCase();
  if (!k) return true;
  const now = Date.now();
  let b = buckets.get(k);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(k, b);
  }
  b.count += 1;
  return b.count <= max;
}

/** Per-email auth throttling; uses Redis when connected, else in-memory per instance. */
export async function allowAuthEmailAttempt(key: string, max: number, windowMs: number): Promise<boolean> {
  const k = String(key || "").trim().toLowerCase();
  if (!k) return true;

  const redis = getRedis();
  if (redis) {
    try {
      const rk = `shopiqgh:auth:email:${k}`;
      const count = await redis.incr(rk);
      if (count === 1) await redis.pExpire(rk, windowMs);
      return count <= max;
    } catch {
      /* fall through */
    }
  }

  return allowInMemory(k, max, windowMs);
}
