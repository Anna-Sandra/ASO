import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password too long")
  .refine((v) => /[a-z]/.test(v), "Password must include a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Password must include an uppercase letter")
  .refine((v) => /\d/.test(v), "Password must include a number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Password must include a special character");

/**
 * Single shape so `displayName` is never dropped by union parsing.
 * Client may send `identifier` only (email or phone) plus `displayName`, or explicit email/phone fields.
 */
export const registerSchema = z
  .object({
    identifier: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: passwordSchema,
    role: z.enum(["buyer", "seller"]).default("buyer"),
    displayName: z.string().optional(),
    username: z.string().optional()
  })
  .transform((raw) => {
    const identifier = typeof raw.identifier === "string" ? raw.identifier.trim() : "";
    const emailIn = typeof raw.email === "string" ? raw.email.trim() : "";
    const phoneIn = typeof raw.phone === "string" ? raw.phone.trim() : "";
    const displayTrim = typeof raw.displayName === "string" ? raw.displayName.trim().slice(0, 120) : "";
    const usernameTrim = typeof raw.username === "string" ? raw.username.trim().slice(0, 120) : "";
    const displayName = displayTrim.length > 0 ? displayTrim : usernameTrim.length > 0 ? usernameTrim : undefined;

    let email = emailIn ? emailIn.toLowerCase() : undefined;
    let phone = phoneIn || undefined;
    if (!email && !phone && identifier.length >= 3) {
      if (identifier.includes("@")) email = identifier.toLowerCase();
      else phone = identifier;
    }

    return {
      email: email || undefined,
      phone: phone || undefined,
      password: raw.password,
      role: raw.role,
      ...(displayName ? { displayName } : {})
    };
  })
  .superRefine((out, ctx) => {
    if (!out.email && !out.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either an email address or a phone number (or a valid sign-in ID).",
        path: ["identifier"]
      });
    }
    if (out.email && !z.string().email().safeParse(out.email).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid email format", path: ["email"] });
    }
    if (out.phone && out.phone.length < 7) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Phone must be at least 7 characters", path: ["phone"] });
    }
    if (out.phone && out.phone.length > 20) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Phone is too long", path: ["phone"] });
    }
  });

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Enter your email or phone (at least 3 characters)."),
  password: z.string().min(1, "Enter your password.")
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional()
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1)
});

export const forgotPasswordSchema = z
  .union([
    z.object({
      channel: z.enum(["email", "phone"]),
      identifier: z.string().trim().min(3)
    }),
    z.object({
      email: z.string().email().transform((s) => s.toLowerCase().trim())
    })
  ])
  .transform((v) => {
    if ("email" in v) {
      return { channel: "email" as const, identifier: v.email };
    }
    return v;
  });

export const resetPasswordSchema = z.object({
  channel: z.enum(["email", "phone"]),
  identifier: z.string().trim().min(3),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
  newPassword: passwordSchema
});

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    bankName: z.string().trim().max(80).optional(),
    bankAccountNumber: z.string().trim().max(40).optional(),
    bankAccountName: z.string().trim().max(120).optional()
  })
  .refine(
    (d) =>
      d.displayName !== undefined ||
      d.phone !== undefined ||
      d.bankName !== undefined ||
      d.bankAccountNumber !== undefined ||
      d.bankAccountName !== undefined,
    { message: "At least one field is required" }
  );

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
  confirm: z
    .string()
    .trim()
    .refine((v) => v.toUpperCase() === "DELETE", 'Type "DELETE" to confirm account deletion')
});

