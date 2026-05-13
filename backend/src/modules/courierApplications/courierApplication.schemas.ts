import { z } from "zod";

function firstQueryString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}

export const submitCourierApplicationSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  vehicleType: z.string().trim().min(1).max(80),
  notes: z.string().trim().min(15).max(800),
  idDocUrl: z.string().trim().max(500).optional().default(""),
  agreeToTerms: z.boolean().refine((v) => v === true, { message: "You must accept the Terms & Conditions." }),
  agreeCourierRules: z.boolean().refine((v) => v === true, { message: "You must acknowledge the courier requirements." })
});

export const adminCourierApplicationsQuerySchema = z.object({
  status: z.preprocess((v) => firstQueryString(v) ?? "pending", z.enum(["pending", "approved", "rejected", "all"])),
  page: z.preprocess((v) => Number(firstQueryString(v)) || 1, z.number().int().positive()),
  limit: z.preprocess((v) => Math.min(Number(firstQueryString(v)) || 20, 50), z.number().int().positive().max(50)),
  search: z.preprocess((v) => (firstQueryString(v) ?? "").trim(), z.string())
});

export const patchCourierApplicationSchema = z.object({
  action: z.enum(["approve", "reject"]),
  adminNote: z.string().trim().max(2000).optional().default("")
});
