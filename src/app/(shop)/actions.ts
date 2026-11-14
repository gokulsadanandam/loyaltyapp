"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { REWARDS_TAG } from "@/lib/data/catalog";
import { errorCode, userMessage, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * The client sends only references (store id, point count) and an idempotency
 * key. Prices, balances and limits are enforced inside the RPCs (migration 0700),
 * which also re-derive the caller from the JWT. These actions only validate shape.
 */

const placeOrderSchema = z.object({
  idempotencyKey: z.uuid(),
  storeId: z.uuid({ message: "Choose a store for pickup." }),
  pointsToRedeem: z.coerce.number().int().min(0).max(1_000_000),
});

export async function placeOrder(input: z.input<typeof placeOrderSchema>): Promise<ActionResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check your order details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  if (!(await getCurrentUser()))
    return { ok: false, error: userMessage({ message: "not_authenticated" }) };

  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("place_order", {
    p_idempotency_key: parsed.data.idempotencyKey,
    p_store_id: parsed.data.storeId,
    p_points_to_redeem: parsed.data.pointsToRedeem,
  });
  if (error) {
    console.warn("place_order failed", { code: errorCode(error) });
    return { ok: false, error: userMessage(error) };
  }
  // redirect() in an action is a client navigation that may reuse the shared
  // (shop) layout from the router cache; refresh() makes it refetch the header too,
  // so the points balance reflects the redemption.
  refresh();
  redirect(`/orders/${orderId}?placed=1`);
}

const redeemSchema = z.object({ rewardId: z.uuid(), idempotencyKey: z.uuid() });

export async function redeemReward(
  input: z.input<typeof redeemSchema>,
): Promise<ActionResult<{ code: string; pointsSpent: number }>> {
  const parsed = redeemSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Something went wrong. Please refresh and try again." };
  if (!(await getCurrentUser()))
    return { ok: false, error: userMessage({ message: "not_authenticated" }) };

  const supabase = await createClient();
  const { data: redemptionId, error } = await supabase.rpc("redeem_reward", {
    p_reward_id: parsed.data.rewardId,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    console.warn("redeem_reward failed", { code: errorCode(error) });
    return { ok: false, error: userMessage(error) };
  }

  const { data: redemption, error: readError } = await supabase
    .from("reward_redemptions")
    .select("code, points_spent")
    .eq("id", redemptionId)
    .single();
  if (readError) return { ok: false, error: userMessage(readError) };

  // Expire cached reward stock (read-your-writes) and re-render the current route,
  // which also refreshes the header balance.
  updateTag(REWARDS_TAG);
  return { ok: true, data: { code: redemption.code, pointsSpent: redemption.points_spent } };
}
