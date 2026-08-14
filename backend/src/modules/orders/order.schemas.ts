import { z } from "zod";

export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
        customization: z.string().trim().max(280).optional().default(""),
        selectedAddonLabels: z.array(z.string().trim().min(1)).max(24).optional()
      })
    )
    .min(1)
    .max(50),
  /** Required when creating an order without authentication (guest checkout). */
  guestEmail: z.string().trim().email().optional(),
  /** Optional legacy — when omitted, server derives display name from email local-part. */
  guestName: z.string().trim().min(2).max(120).optional(),
  guestPhone: z.string().trim().min(8).max(24).optional(),
  /** Loyalty: redeem points (100 pts = GHS 1 off merchandise). Logged-in buyers only. */
  redeemPoints: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  /** Delivery drop-off for live map tracking (optional but recommended). */
  dropoffLatitude: z.coerce.number().min(-90).max(90).optional(),
  dropoffLongitude: z.coerce.number().min(-180).max(180).optional(),
  dropoffLabel: z.string().trim().max(500).optional()
}).superRefine((data, ctx) => {
  const hasLat = data.dropoffLatitude != null;
  const hasLng = data.dropoffLongitude != null;
  if (hasLat !== hasLng) {
    ctx.addIssue({
      code: "custom",
      message: "dropoffLatitude and dropoffLongitude must be provided together",
      path: ["dropoffLatitude"]
    });
  }
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(["processing", "sent_for_delivery", "delivered", "cancelled"])
});

export const orderMessageSchema = z.object({
  text: z.string().trim().min(1).max(1000)
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  /** For guest orders — same value returned once at checkout (or use `X-Guest-Order-Secret` header). */
  guestSecret: z.string().min(8).max(256).optional()
});

export const guestTrackLookupSchema = z.object({
  orderId: z.string().trim().min(6).max(64),
  email: z.string().trim().email().max(320)
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
    reference: z.string().trim().max(120).optional(),
    guestSecret: z.string().min(8).max(256).optional()
  }),
  z.object({
    method: z.literal("bank"),
    cardholderName: z.string().trim().min(2).max(120),
    cardNumber: cardDigits,
    cardExpiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Use MM/YY"),
    cvv: z.string().regex(/^\d{3,4}$/, "Invalid CVV"),
    reference: z.string().trim().max(120).optional(),
    guestSecret: z.string().min(8).max(256).optional()
  })
]);
