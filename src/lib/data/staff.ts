import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { requireUser } from "@/lib/auth";
import type { Enums } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff console reads. These are UI gates only: every mutation goes through an
 * RPC that re-checks the caller's merchant_staff role server-side.
 */

export type StaffRole = Enums<"staff_role">;

export interface StaffContext {
  userId: string;
  merchantId: string;
  role: StaffRole;
}

/** The caller's role at the default merchant, or null. Live lookup, not a JWT claim. */
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("merchant_staff")
    .select("merchant_id, role, merchant:merchants!inner(is_default)")
    .eq("user_id", userId)
    .eq("merchant.is_default", true)
    .maybeSingle();
  if (error) throw new Error(`getStaffContext: ${error.message}`);
  return data ? { userId, merchantId: data.merchant_id, role: data.role } : null;
});

/** 404 (not 403) for non-staff, so the console's existence isn't advertised. */
export async function requireStaff(next: string, roles?: StaffRole[]): Promise<StaffContext> {
  await requireUser(next);
  const ctx = await getStaffContext();
  if (!ctx || (roles && !roles.includes(ctx.role))) notFound();
  return ctx;
}

export const canRefund = (role: StaffRole) => role === "owner" || role === "admin";

export interface StaffOrder {
  id: string;
  status: Enums<"order_status">;
  createdAt: string;
  totalPaise: number;
  pointsRedeemed: number;
  pointsEarned: number;
  storeName: string | null;
  customerName: string;
  memberCode: string | null;
  itemCount: number;
}

export async function getMerchantOrders(
  ctx: StaffContext,
  status: Enums<"order_status"> | "all",
): Promise<StaffOrder[]> {
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(
      "id, status, created_at, total_paise, points_redeemed, points_earned, store:stores(name), items:order_items(qty), account:loyalty_accounts!inner(user_id)",
    )
    .eq("merchant_id", ctx.merchantId)
    .order("created_at", { ascending: status === "pending" })
    .limit(50);
  if (status !== "all") query = query.eq("status", status);
  const { data: orders, error } = await query;
  if (error) throw new Error(`getMerchantOrders: ${error.message}`);

  // profiles has no FK path from orders; fetch names in one round trip.
  const userIds = [...new Set(orders.map((o) => o.account.user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name, member_code")
        .in("id", userIds)
    : { data: [], error: null };
  if (profileError) throw new Error(`getMerchantOrders profiles: ${profileError.message}`);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return orders.map((o) => {
    const p = byId.get(o.account.user_id);
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ");
    return {
      id: o.id,
      status: o.status,
      createdAt: o.created_at,
      totalPaise: o.total_paise,
      pointsRedeemed: o.points_redeemed,
      pointsEarned: o.points_earned,
      storeName: o.store?.name ?? null,
      customerName: name || "Member",
      memberCode: p?.member_code ?? null,
      itemCount: o.items.reduce((sum, i) => sum + i.qty, 0),
    };
  });
}

export interface MemberLookup {
  name: string;
  memberCode: string;
  tierName: string | null;
  multiplierBps: number;
}

/** Staff can read profiles/accounts of their merchant's members (RLS). */
export async function lookupMember(
  ctx: StaffContext,
  memberCode: string,
): Promise<MemberLookup | null> {
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, member_code")
    .eq("member_code", memberCode.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new Error(`lookupMember: ${error.message}`);
  if (!profile) return null;

  const { data: account, error: accountError } = await supabase
    .from("loyalty_accounts")
    .select("id, tier:tiers(name, multiplier_bps)")
    .eq("user_id", profile.id)
    .eq("merchant_id", ctx.merchantId)
    .maybeSingle();
  if (accountError) throw new Error(`lookupMember account: ${accountError.message}`);
  if (!account) return null;

  return {
    name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Member",
    memberCode: profile.member_code,
    tierName: account.tier?.name ?? null,
    multiplierBps: account.tier?.multiplier_bps ?? 10_000,
  };
}
