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
  balance: number;
  lifetimeEarned: number;
  tier: { name: string; multiplierBps: number } | null;
}

export const getAccountSummary = cache(async (): Promise<AccountSummary | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const [profileRes, accountRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, member_code, referral_code")
      .eq("id", user.id)
      .single(),
    supabase
      .from("loyalty_accounts")
      .select(
        "id, merchant:merchants!inner(is_default), tier:tiers(name, multiplier_bps), balance:point_balances(balance, lifetime_earned)",
      )
      .eq("user_id", user.id)
      .eq("merchant.is_default", true)
      .single(),
  ]);
  if (profileRes.error) throw new Error(`profile: ${profileRes.error.message}`);
  if (accountRes.error) throw new Error(`account: ${accountRes.error.message}`);

  const { data: profile } = profileRes;
  const { data: account } = accountRes;
  return {
    userId: user.id,
    email: user.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    memberCode: profile.member_code,
    referralCode: profile.referral_code,
    accountId: account.id,
    balance: account.balance?.balance ?? 0,
    lifetimeEarned: account.balance?.lifetime_earned ?? 0,
    tier: account.tier
      ? { name: account.tier.name, multiplierBps: account.tier.multiplier_bps }
      : null,
  };
});

export function displayName(summary: Pick<AccountSummary, "firstName" | "lastName" | "email">) {
  const name = [summary.firstName, summary.lastName].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : (summary.email ?? "Member");
}
