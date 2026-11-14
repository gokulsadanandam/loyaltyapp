import "server-only";

import { getCurrentUser } from "@/lib/auth";
import type { Enums } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export interface MemberNotification {
  id: string;
  kind: Enums<"notification_kind">;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * RLS ("own read") scopes every query to the caller. user_id is deliberately not
 * column-granted to members, so it can't be filtered on (or leaked) from here.
 */
export async function getUnreadCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw new Error(`getUnreadCount: ${error.message}`);
  return count ?? 0;
}

export async function getNotifications(limit = 50): Promise<MemberNotification[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getNotifications: ${error.message}`);
  return data.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

export async function getEmailPreference(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return true;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("email_notifications")
    .eq("id", user.id)
    .single();
  if (error) throw new Error(`getEmailPreference: ${error.message}`);
  return data.email_notifications;
}
