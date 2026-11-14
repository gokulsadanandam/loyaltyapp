import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for email links (signup confirmation, password recovery).
 * Exchanges the PKCE `code` for a session cookie, then continues to `next`.
 * Redirects are built from NEXT_PUBLIC_SITE_URL, never from the Host header.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${env.NEXT_PUBLIC_SITE_URL}${next}`);
  }

  // Expired link, or opened in a different browser from the one that requested it.
  // A signup confirmation has still been applied by Supabase, so signing in works.
  return NextResponse.redirect(`${env.NEXT_PUBLIC_SITE_URL}/login?notice=link`);
}
