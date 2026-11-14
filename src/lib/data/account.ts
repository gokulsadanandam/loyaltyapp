import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Signed-in user's loyalty snapshot. Every query runs as the user (RLS), and the
 * functions take no user id, so a caller can never ask for someone else's data.
 */

export interface AccountSummary {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  memberCode: string;
  referralCode: string;
  accountId: string;
  /** Booked balance; may include expired lots the nightly sweep hasn't cleared yet. */
  balance: number;
  /** What checkout and rewards will actually accept. Show this to customers. */
  available: number;
  lifetimeEarned: number;
  expiringSoon: number;
  nextExpiryAt: string | null;
  tier: { name: string; multiplierBps: number } | null;
}

export const getAccountSummary = cache(async (): Promise<AccountSummary | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const [profileRes, accountRes, pointsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, member_code, referral_code")
      .eq("id", user.id)
      .single(),
    supabase
      .from("loyalty_accounts")
      .select("id, merchant:merchants!inner(is_default), tier:tiers(name, multiplier_bps)")
      .eq("user_id", user.id)
      .eq("merchant.is_default", true)
      .single(),
    supabase.rpc("my_points_summary").maybeSingle(),
  ]);
  if (profileRes.error) throw new Error(`profile: ${profileRes.error.message}`);
  if (accountRes.error) throw new Error(`account: ${accountRes.error.message}`);
  if (pointsRes.error) throw new Error(`points: ${pointsRes.error.message}`);

  const { data: profile } = profileRes;
  const { data: account } = accountRes;
  const points = pointsRes.data;
  return {
    userId: user.id,
    email: user.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    memberCode: profile.member_code,
    referralCode: profile.referral_code,
    accountId: account.id,
    balance: points?.balance ?? 0,
    available: points?.available ?? 0,
    lifetimeEarned: points?.lifetime_earned ?? 0,
    expiringSoon: points?.expiring_30d ?? 0,
    // Generated types mark this non-null, but min() over no rows is NULL.
    nextExpiryAt: (points?.next_expiry_at as string | null | undefined) ?? null,
    tier: account.tier
      ? { name: account.tier.name, multiplierBps: account.tier.multiplier_bps }
      : null,
  };
});

export function displayName(summary: Pick<AccountSummary, "firstName" | "lastName" | "email">) {
  const name = [summary.firstName, summary.lastName].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : (summary.email ?? "Member");
}

export interface ReferralStats {
  invited: number;
  rewarded: number;
  pointsEarned: number;
}

/** Counts only: the referred members' identities are never exposed (see my_referrals). */
export async function getReferralStats(): Promise<ReferralStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_referrals").maybeSingle();
  if (error) throw new Error(`referrals: ${error.message}`);
  return {
    invited: data?.invited ?? 0,
    rewarded: data?.rewarded ?? 0,
    pointsEarned: data?.points_earned ?? 0,
  };
}
