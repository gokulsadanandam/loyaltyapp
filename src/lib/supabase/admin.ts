import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

/**
 * Service-role client. BYPASSES RLS. Use only in trusted background jobs that
 * authenticate their caller first (the notification delivery worker). Never
 * import from a page, component or user-facing Server Action.
 */
export function createAdminClient() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
