import { z } from "zod";

export const cartSnapshotBodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(99)
      })
    )
    .max(40)
});
