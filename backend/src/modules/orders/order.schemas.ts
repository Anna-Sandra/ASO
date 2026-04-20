import { z } from "zod";

export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive()
      })
    )
    .min(1)
    .max(50)
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(["processing", "sent_for_delivery", "delivered", "cancelled"])
});

export const orderMessageSchema = z.object({
  text: z.string().trim().min(1).max(1000)
});

const phoneLike = z
  .string()
  .trim()
  .min(8, "Phone number is too short")
  .max(20)
  .refine((s) => /^[\d+\s()-]+$/.test(s), "Invalid phone characters");

const cardDigits = z
  .string()
  .min(13)
  .max(23)
  .refine((s) => {
    const d = s.replace(/\D/g, "");
    return d.length >= 13 && d.length <= 19;
  }, "Card number length is invalid");

export const orderManualPaymentSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("momo"),
    momoPhone: phoneLike,
    momoAmount: z.coerce.number().positive("Amount must be positive"),
    reference: z.string().trim().max(120).optional()
  }),
  z.object({
    method: z.literal("bank"),
    cardholderName: z.string().trim().min(2).max(120),
    cardNumber: cardDigits,
    cardExpiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Use MM/YY"),
    cvv: z.string().regex(/^\d{3,4}$/, "Invalid CVV"),
    reference: z.string().trim().max(120).optional()
  })
]);
