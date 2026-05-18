import { z } from "zod";
import mongoose from "mongoose";
import { BUSINESS_TYPES } from "./business.model";

const businessTypeEnum = z.enum(BUSINESS_TYPES);

const geoSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180)
  })
  .optional();

const hoursDaySchema = z.object({
  open: z.string().max(16).optional(),
  close: z.string().max(16).optional(),
  closed: z.boolean().optional()
});

const operatingHoursSchema = z.record(z.string(), hoursDaySchema).optional();

export const createBusinessSchema = z.object({
  businessType: businessTypeEnum,
  name: z.string().min(2).max(200),
  description: z.string().max(8000).optional().default(""),
  logoUrl: z.union([z.string().url(), z.string().max(500), z.null()]).optional(),
  bannerUrl: z.union([z.string().url(), z.string().max(500), z.null()]).optional(),
  contactPhone: z.string().max(32).optional().default(""),
  contactEmail: z.string().email().max(200).optional().or(z.literal("")).default(""),
  locationLabel: z.string().max(500).optional().default(""),
  geoLocation: geoSchema.nullable().optional(),
  deliveryRadiusKm: z.coerce.number().min(0).max(500).optional().nullable(),
  operatingHours: operatingHoursSchema,
  tags: z.array(z.string().max(32)).max(20).optional().default([]),
  deliveryAvailable: z.boolean().optional().default(false),
  pickupAvailable: z.boolean().optional().default(true),
  estimatedDeliveryMins: z.coerce.number().int().min(1).max(10080).optional().nullable(),
  deliveryFee: z.coerce.number().min(0).optional().nullable(),
  /** Vendors may only create draft or submit for approval — not go live without admin. */
  status: z.enum(["draft", "pending_approval"]).optional().default("draft"),
  settings: z.record(z.string(), z.unknown()).optional().default({})
});

export const updateBusinessSchema = createBusinessSchema.partial();

export const listBusinessesQuerySchema = z.object({
  type: businessTypeEnum.optional(),
  q: z.string().max(200).optional(),
  /** Browse-all page may request more; keep a ceiling to limit abuse on public route. */
  limit: z.coerce.number().int().min(1).max(200).optional().default(24),
  cursor: z.string().optional()
});

const menuBody = z.object({
  title: z.string().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0)
});

export const createMenuSectionSchema = menuBody;
export const updateMenuSectionSchema = menuBody.partial();

export function objectIdLike(s: unknown): boolean {
  return typeof s === "string" && mongoose.isValidObjectId(s);
}
