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
  /** When true, response is SSE (`text/event-stream`) with incremental `delta` events — feels much faster than waiting for JSON. */
  stream: z.boolean().optional().default(false)
});