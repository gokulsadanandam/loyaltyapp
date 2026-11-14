import "server-only";

import { z } from "zod";

/**
 * Server-only secrets, validated on first use (not at import), so pages that
 * never touch them build and run without them configured.
 */
const schema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  CRON_SECRET: z.string().min(24, "CRON_SECRET must be at least 24 characters."),
  EMAIL_FROM: z.string().min(3),
  // Neither set = email off: notifications stay in-app and queue until a transport exists.
  RESEND_API_KEY: z.string().min(10).optional(),
  MAILPIT_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

/** Whether an email transport (Resend in production, Mailpit locally) is configured. */
export function emailEnabled(config: ServerEnv): boolean {
  return Boolean(config.RESEND_API_KEY ?? config.MAILPIT_URL);
}

let cached: ServerEnv | undefined;

/** An empty `FOO=` line in .env means "not set". */
const blank = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v);

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    EMAIL_FROM: process.env.EMAIL_FROM,
    RESEND_API_KEY: blank(process.env.RESEND_API_KEY),
    MAILPIT_URL: blank(process.env.MAILPIT_URL),
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment (see .env.example):\n${z.prettifyError(parsed.error)}`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Member QR signing key, validated separately so QR codes don't need email config. */
export function qrSecret(): string {
  const parsed = z
    .string()
    .min(32, "QR_HMAC_SECRET must be at least 32 characters.")
    .safeParse(process.env.QR_HMAC_SECRET);
  if (!parsed.success) {
    throw new Error(
      `Invalid QR_HMAC_SECRET (see .env.example): ${parsed.error.issues[0]?.message ?? ""}`,
    );
  }
  return parsed.data;
}
