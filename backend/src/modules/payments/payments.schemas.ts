import { z } from "zod";

export const createCheckoutSessionSchema = z.object({
  orderId: z.string().min(1)
});

export const paystackInitializeSchema = createCheckoutSessionSchema;

export const paystackVerifyOrderSchema = z.object({
  orderId: z.string().min(1)
});

/** Body matches the Paystack guide: email + amount (GHS major units) + our order id. */
export const paystackInitGuideSchema = z.object({
  email: z.string().email().max(320),
  amount: z.coerce.number().positive().finite(),
  orderId: z.string().min(1)
});
