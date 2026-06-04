import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const daysQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30)
});

export const conversationInboxQuerySchema = z.object({
  as: z.enum(["buyer", "seller"]).optional()
});

export const notificationsQuerySchema = z.object({
  unread: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1")
});
