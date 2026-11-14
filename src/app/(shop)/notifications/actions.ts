"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** Marks the caller's unread notifications read. RLS + column grant: read_at only, own rows. */
export async function markAllRead(): Promise<ActionResult> {
  if (!(await getCurrentUser())) return { ok: false, error: "Please sign in to continue." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) return { ok: false, error: "Couldn't update notifications." };
  refresh(); // header unread badge
  return { ok: true };
}

export async function setEmailNotifications(enabled: boolean): Promise<ActionResult> {
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in to continue." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ email_notifications: parsed.data })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't save your preference." };
  return { ok: true };
}
