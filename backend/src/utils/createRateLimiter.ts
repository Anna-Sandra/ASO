import rateLimit, { type Options, type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../config/redis";

type LimiterOptions = Partial<Options> & Pick<Options, "windowMs"> & { limit: Options["limit"] };

/** Shared Redis store when `REDIS_URL` is set; otherwise in-memory (single instance). */
export function createRateLimiter(opts: LimiterOptions): RateLimitRequestHandler {
  const redis = getRedis();
  if (redis) {
    return rateLimit({
      standardHeaders: true,
      legacyHeaders: false,
      ...opts,
      store: new RedisStore({
        sendCommand: (...args: string[]) => redis.sendCommand(args)
      })
    });
  }
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...opts
  });
}
