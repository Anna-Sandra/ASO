import { z } from "zod";
import { PRODUCT_CATEGORIES } from "../products/product.model";
import { isCoordinateInGhana } from "../../utils/ghanaGeo";

export const applicationGhanaLocationFields = {
  locationLat: z.coerce.number({ message: "Capture your live location in Ghana." }),
  locationLng: z.coerce.number({ message: "Capture your live location in Ghana." }),
  locationLabel: z.string().trim().max(300).optional().default(""),
  locationAccuracyM: z.coerce.number().min(0).max(50_000).optional().nullable()
};

function firstQueryString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}

export const submitVendorApplicationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { message: "Please enter your full name." })
    .max(120, { message: "Full name must be at most 120 characters." }),
  shopName: z
    .string()
    .trim()
    .min(1, { message: "Please enter your shop or business name." })
    .max(120, { message: "Shop name must be at most 120 characters." }),
  category: z.enum(PRODUCT_CATEGORIES, { message: "Please choose a valid category." }),
  sellsDescription: z
    .string()
    .trim()
    .min(1, { message: 'Please describe what you sell (e.g. "snacks, phone cases").' })
    .max(200, { message: "That description is too long (max 200 characters)." }),
  phone: z
    .string()
    .trim()
    .min(5, { message: "Please enter a valid phone number." })
    .max(40, { message: "Phone number is too long." }),
  altPhone: z.string().trim().max(40).optional().default(""),
  shopDescription: z
    .string()
    .trim()
    .min(10, {
      message:
        "Shop description must be at least 10 characters. Tell buyers what you offer, your standards, and how you fulfill orders."
    })
    .max(300, { message: "Shop description must be 300 characters or less." }),
  verificationDocUrl: z
    .string()
    .trim()
    .min(1, { message: "Upload a Ghana Card or ID photo / PDF." })
    .regex(/\.(jpg|jpeg|png|webp)(\?|$)/i, { message: "Upload an ID photo image (JPG, PNG, or WebP)." })
    .max(500, { message: "Verification URL is invalid." }),
  selfieUrl: z
    .string()
    .trim()
    .min(1, { message: "Upload a selfie photo." })
    .regex(/\.(jpg|jpeg|png|webp)(\?|$)/i, { message: "Selfie must be JPG, PNG, or WebP." })
    .max(500, { message: "Selfie URL is invalid." }),
  ...applicationGhanaLocationFields,
  agreeToTerms: z.boolean().refine((v) => v === true, { message: "You must accept the Terms & Conditions." }),
  agreeToVendorRules: z.boolean().refine((v) => v === true, { message: "You must accept the vendor rules." }),
  /** Required when submitting without signing in — ignored for authenticated shoppers (profile email wins). */
  email: z.union([z.literal(""), z.string().trim().email().max(200)]).optional()
}).superRefine((body, ctx) => {
  if (!isCoordinateInGhana(body.locationLat, body.locationLng)) {
    ctx.addIssue({
      code: "custom",
      message: "Your GPS location must be inside Ghana. Tap “Use my current location” again.",
      path: ["locationLat"]
    });
  }
});

export const adminVendorApplicationsQuerySchema = z.object({
  status: z.preprocess((v) => firstQueryString(v) ?? "pending", z.enum(["pending", "approved", "rejected", "all"])),
  page: z.preprocess((v) => Number(firstQueryString(v)) || 1, z.number().int().positive()),
  limit: z.preprocess((v) => Math.min(Number(firstQueryString(v)) || 20, 50), z.number().int().positive().max(50)),
  search: z.preprocess((v) => (firstQueryString(v) ?? "").trim(), z.string())
});

export const patchVendorApplicationSchema = z.object({
  action: z.enum(["approve", "reject"]),
  adminNote: z.string().trim().max(2000).optional().default("")
});
