import { z } from "zod";

export const conversationMessageSchema = z.object({
  text: z.string().trim().min(1).max(1000)
});
