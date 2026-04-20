import { z } from "zod";
import { env } from "../../config/env";

export const createReviewSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().max(2000).optional().default(""),
    /** Required unless REVIEWS_SKIP_VERIFIED_PURCHASE is true (see env). */
    orderId: z.string().optional().default("")
  })
  .superRefine((data, ctx) => {
    if (env.REVIEWS_SKIP_VERIFIED_PURCHASE) return;
    if (!String(data.orderId || "").trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Order reference is required for a verified review",
        path: ["orderId"]
      });
    }
  });
