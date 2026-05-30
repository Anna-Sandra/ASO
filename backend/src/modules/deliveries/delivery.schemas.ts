import { z } from "zod";

export const deliveryStageSchema = z.enum([
  "order_placed",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled"
]);

export const patchDeliveryStageSchema = z.object({
  stage: deliveryStageSchema,
  proofPhotoUrl: z.string().min(1).max(2000).optional(),
  receivedByName: z.string().max(120).optional(),
  customerSignatureUrl: z.string().max(2000).optional(),
  deliveryNote: z.string().max(500).optional()
});
export const assignRiderSchema = z.object({ riderUserId: z.string().min(1) });
export const riderLocationSchema = z.object({ latitude: z.number(), longitude: z.number() });
export const dropoffSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  label: z.string().max(500).optional()
});
export const etaSchema = z.object({
  estimatedArrivalMinutes: z.number().int().min(0).max(10080)
});
export const adminCreateRiderSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  vehicleType: z.string().min(1).max(80)
});
