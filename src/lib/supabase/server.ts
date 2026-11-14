import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/**
 * Per-request client bound to the caller's auth cookies. Every query runs as
 * the signed-in user, so RLS applies. Reads cookies, so callers must sit behind
 * a <Suspense> boundary (Cache Components) or run in a Server Action / Route Handler.
 */
export async function createClient() {
  // Session handling compares token expiry with the current time (Date.now), which
  // Cache Components only allows once rendering is explicitly at request time.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // proxy.ts refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
