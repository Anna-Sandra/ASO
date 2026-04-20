import { z } from "zod";

export const createCheckoutSessionSchema = z.object({
  orderId: z.string().min(1)
});
