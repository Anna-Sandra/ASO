import { z } from "zod";

export const assistantChatSchema = z.object({
  message: z.string().trim().min(1).max(2500),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000)
      })
    )
    .max(16)
    .optional()
    .default([]),
  /**
   * When true (default recommended for web UI), response is SSE (`text/event-stream`) with incremental `delta`.
   * Coerces JSON string `"true"` / `"false"` for older clients or manual tools.
   */
  stream: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === undefined ? false : v === true || v === "true")),
});