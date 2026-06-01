import mongoose from "mongoose";
import { z } from "zod";

export const conversationMessageSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  /** `listing` = message from a product page before an order exists. */
  context: z.enum(["listing", "order"]).optional(),
  productId: z
    .string()
    .optional()
    .refine((s) => !s || mongoose.isValidObjectId(s), { message: "Invalid product id" })
});

export const openListingConversationSchema = z.object({
  productId: z
    .string()
    .optional()
    .refine((s) => !s || mongoose.isValidObjectId(s), { message: "Invalid product id" })
});
