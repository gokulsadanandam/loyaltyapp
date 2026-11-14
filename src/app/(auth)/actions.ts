"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  formToObject,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validation/auth";

export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echo of non-secret inputs so the form can repopulate after a failed submit. */
  values?: Record<string, string>;
}

const callbackUrl = (next: string) =>
  `${env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`;

function invalid(error: z.ZodError, values: Record<string, string>): FormState {
  return {
    status: "error",
    message: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors,
    values,
  };
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formToObject(formData);
  const values = { email: raw.email ?? "" };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    const message =
      error.code === "email_not_confirmed"
        ? "Please confirm your email first. Check your inbox for the link."
        : "Incorrect email or password.";
    return { status: "error", message, values };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formToObject(formData);
  const { password: _password, ...values } = raw;
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, values);

  const { email, password, firstName, lastName, phone, referralCode } = parsed.data;
  const supabase = await createClient();
  // handle_new_user (migration 0500) reads these keys to build the profile,
  // enrol the loyalty account and post the signup bonus.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl("/?welcome=1"),
      data: {
        first_name: firstName,
        last_name: lastName ?? null,
        phone: phone ?? null,
        referral_code: referralCode?.toUpperCase() ?? null,
      },
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return {
        status: "error",
        message: "Choose a stronger password.",
        fieldErrors: { password: [error.message] },
        values,
      };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { status: "error", message: "Too many attempts. Please wait a minute.", values };
    }
    return {
      status: "error",
      message: "We couldn't create your account. Please try again.",
      values,
    };
  }

  // Email confirmation off (e.g. some environments): already signed in.
  if (data.session) redirect("/?welcome=1");

  // Confirmation on. Supabase returns the same response for an existing email,
  // so this message never reveals whether an account exists.
  return {
    status: "success",
    message: `We've sent a confirmation link to ${email}. Open it to activate your account and collect your welcome points.`,
  };
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formToObject(formData);
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, { email: raw.email ?? "" });

  const supabase = await createClient();
  // Errors are deliberately not surfaced: the response must not reveal whether the email exists.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl("/reset-password"),
  });
  return {
    status: "success",
    message: "If an account exists for that email, we've sent a link to reset your password.",
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, {});

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) {
    return { status: "error", message: "Your reset link has expired. Please request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const message =
      error.code === "same_password"
        ? "Choose a password you haven't used before."
        : "We couldn't update your password. Please try again.";
    return { status: "error", message };
  }
  redirect("/account?password=updated");
}

/** Clears the session cookies. The caller does a full page load afterwards (see AccountMenu). */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
