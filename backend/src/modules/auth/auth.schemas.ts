import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password too long")
  .refine((v) => /[a-z]/.test(v), "Password must include a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Password must include an uppercase letter")
  .refine((v) => /\d/.test(v), "Password must include a number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Password must include a special character");

/** Email-only registration — always creates a shopper (`buyer`). Vendor access is by application after login. */
export const registerSchema = z
  .object({
    identifier: z.string().optional(),
    email: z.string().optional(),
    password: passwordSchema,
    displayName: z.string().optional(),
    username: z.string().optional()
  })
  .transform((raw) => {
    const identifier = typeof raw.identifier === "string" ? raw.identifier.trim() : "";
    const emailIn = typeof raw.email === "string" ? raw.email.trim() : "";
    const displayTrim = typeof raw.displayName === "string" ? raw.displayName.trim().slice(0, 120) : "";
    const usernameTrim = typeof raw.username === "string" ? raw.username.trim().slice(0, 120) : "";
    const displayName = displayTrim.length > 0 ? displayTrim : usernameTrim.length > 0 ? usernameTrim : undefined;

    const email = (emailIn || (identifier.includes("@") ? identifier : "")).toLowerCase();

    return {
      email: email || undefined,
      password: raw.password,
      role: "buyer" as const,
      ...(displayName ? { displayName } : {})
    };
  })
  .superRefine((out, ctx) => {
    if (!out.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a valid email address.",
        path: ["email"]
      });
    } else if (!z.string().email().safeParse(out.email).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid email format", path: ["email"] });
    }
  });

export const loginSchema = z.object({
  identifier: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.")
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional()
});

export const verifyEmailSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your email")
});

export const verifyLoginOtpSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your email")
});

export const resendVerificationOtpSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim())
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim())
});

export const resetPasswordSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
  newPassword: passwordSchema
});

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().max(120).optional(),
    /** MoMo / payout number for sellers only; ignored for buyers and admins. */
    phone: z.string().trim().max(40).optional(),
    bankName: z.string().trim().max(80).optional(),
    bankAccountNumber: z.string().trim().max(40).optional(),
    bankAccountName: z.string().trim().max(120).optional(),
    /** Remove profile photo; use `POST /api/uploads/profile-image` to set a new one. */
    clearProfileImage: z.boolean().optional()
  })
  .refine(
    (d) =>
      d.displayName !== undefined ||
      d.phone !== undefined ||
      d.bankName !== undefined ||
      d.bankAccountNumber !== undefined ||
      d.bankAccountName !== undefined ||
      d.clearProfileImage === true,
    { message: "At least one field is required" }
  );

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
  confirm: z
    .string()
    .trim()
    .refine((v) => v.toUpperCase() === "DELETE", 'Type "DELETE" to confirm account deletion')
});

