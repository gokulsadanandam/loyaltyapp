import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { renderNotificationEmail, sendEmail } from "@/lib/notifications/email";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Drains the notification email outbox. Called by Vercel Cron (GET, with
 * `Authorization: Bearer $CRON_SECRET`) or any scheduler that can send that header.
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so overlapping runs are safe.
 */

/** Constant-time comparison of the bearer token (hash first: equal lengths). */
function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(secret).digest();
  return token.length > 0 && timingSafeEqual(a, b);
}

async function deliver(request: NextRequest) {
  const config = serverEnv();
  if (!authorized(request, config.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: batch, error } = await supabase.rpc("claim_notification_emails", { p_limit: 50 });
  if (error) {
    console.error("claim_notification_emails failed", { code: error.code });
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const row of batch) {
    try {
      const content = renderNotificationEmail({
        firstName: row.first_name,
        title: row.title,
        body: row.body,
        link: row.link,
        siteUrl: env.NEXT_PUBLIC_SITE_URL,
      });
      await sendEmail({ to: row.email, ...content }, config);
      await supabase.rpc("complete_notification_email", { p_id: row.id, p_ok: true });
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "send_failed";
      await supabase.rpc("complete_notification_email", {
        p_id: row.id,
        p_ok: false,
        p_error: message,
      });
      failed += 1;
    }
  }

  return NextResponse.json({ claimed: batch.length, sent, failed });
}

export const GET = deliver;
export const POST = deliver;
