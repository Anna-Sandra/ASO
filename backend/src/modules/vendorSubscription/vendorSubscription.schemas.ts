import { z } from "zod";

export const vendorSubscriptionVerifyParamsSchema = z.object({
  ref: z.string().trim().min(1).max(120)
});
