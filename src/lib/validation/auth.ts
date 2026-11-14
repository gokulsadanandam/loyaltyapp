import { z } from "zod";

// Mirrors supabase/config.toml: minimum_password_length = 8, password_requirements = "letters_digits".
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

const email = z
  .email("Enter a valid email address.")
  .max(254)
  .transform((v) => v.toLowerCase());

const optionalTrimmed = (schema: z.ZodString) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(schema.optional());

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export const signupSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(80),
  lastName: optionalTrimmed(z.string().max(80)),
  email,
  // Same pattern as the profiles.phone CHECK constraint.
  phone: optionalTrimmed(z.string().regex(/^\+?[0-9 ]{7,20}$/, "Enter a valid phone number.")),
  password: passwordSchema,
  referralCode: optionalTrimmed(
    z
      .string()
      .max(16)
      .regex(/^[A-Za-z0-9]+$/, "Referral codes contain only letters and numbers."),
  ),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  });

/** FormData → plain object of strings (files and repeated keys are ignored). */
export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !(key in out)) out[key] = value;
  }
  return out;
}
