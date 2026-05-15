import { z } from "zod";
import mongoose from "mongoose";

export const createServiceInquirySchema = z.object({
  productId: z.string().refine((s) => mongoose.isValidObjectId(s), "Invalid product id"),
  message: z.string().trim().min(10, "Please write at least a short request.").max(4000),
  preferredTime: z.string().trim().max(500).optional().default("")
});

export const patchServiceInquirySchema = z.object({
  status: z.enum(["read", "archived"])
});
