import { z } from "zod";

export const createReportSchema = z.object({
  category: z.enum(["fake_seller", "scam", "bad_product", "chat_abuse", "other"]),
  description: z.string().trim().min(10).max(4000),
  targetType: z.enum(["product", "user", "order", "other"]).default("other"),
  targetId: z.string().trim().max(64).optional()
});
