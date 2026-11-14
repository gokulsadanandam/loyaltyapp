import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const num = z.coerce.number();

/** Shape of public.merchant_analytics(); validated so a schema drift fails loudly. */
const analyticsSchema = z.object({
  days: num,
  point_value_paise: num,
  liability: z.object({ points: num, paise: num }),
  points: z.object({
    issued: num,
    redeemed: num,
    expired: num,
    lifetime_issued: num,
    lifetime_redeemed: num,
  }),
  members: z.object({ total: num, new: num, active: num }),
  orders: z.object({ fulfilled: num, revenue_paise: num, avg_order_paise: num }),
  repeat: z.object({ buyers: num, repeat_buyers: num }),
  tiers: z.array(z.object({ name: z.string(), members: num })),
  daily: z.array(z.object({ day: z.string(), issued: num, redeemed: num })),
});

export type MerchantAnalytics = z.infer<typeof analyticsSchema>;

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

/** Owner/admin only: the RPC raises 42501 for anyone else. */
export async function getMerchantAnalytics(days: Range): Promise<MerchantAnalytics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merchant_analytics", { p_days: days });
  if (error) throw new Error(`merchant_analytics: ${error.message}`);
  return analyticsSchema.parse(data);
}

/** a/b as a whole percent; 0 when there's nothing to divide by. */
export function percent(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}
