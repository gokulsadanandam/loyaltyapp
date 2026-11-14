import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import type { Tables } from "@/lib/database.types";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Public catalog reads. Cookie-less and identical for every visitor, so they are
 * cached on the server and prerendered into the static shell. Invalidate with
 * `updateTag("catalog")` once the admin console (Phase 3) edits the catalog.
 */

export type Product = Pick<
  Tables<"products">,
  | "id"
  | "sku"
  | "name"
  | "short_name"
  | "category"
  | "description"
  | "specs"
  | "list_price_paise"
  | "sale_price_paise"
  | "image_path"
>;

export type Reward = Pick<
  Tables<"rewards">,
  "id" | "name" | "description" | "points_cost" | "stock" | "image_path" | "starts_at" | "ends_at"
>;

export type Store = Pick<
  Tables<"stores">,
  "id" | "name" | "address_line" | "city" | "postal_code" | "phone"
>;

export interface MerchantRules {
  id: string;
  name: string;
  earnRateBps: number;
  pointValuePaise: number;
  maxRedeemBps: number;
  signupBonusPoints: number;
  tiers: { id: string; name: string; minLifetimePoints: number; multiplierBps: number }[];
}

export const REWARDS_TAG = "rewards";

const PRODUCT_COLUMNS =
  "id, sku, name, short_name, category, description, specs, list_price_paise, sale_price_paise, image_path";

export async function getProducts(): Promise<Product[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  const { data, error } = await createPublicClient()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("active", true)
    .order("sku");
  if (error) throw new Error(`getProducts: ${error.message}`);
  return data;
}

export async function getProductBySku(sku: string): Promise<Product | null> {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  const { data, error } = await createPublicClient()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("active", true)
    .eq("sku", sku)
    .maybeSingle();
  if (error) throw new Error(`getProductBySku: ${error.message}`);
  return data;
}

/** Active rewards. The time window is applied by the caller at render time. */
export async function getRewards(): Promise<Reward[]> {
  "use cache";
  // Stock changes on every redemption: redeemReward expires REWARDS_TAG.
  cacheTag("catalog", REWARDS_TAG);
  cacheLife("minutes");
  const { data, error } = await createPublicClient()
    .from("rewards")
    .select("id, name, description, points_cost, stock, image_path, starts_at, ends_at")
    .eq("active", true)
    .order("points_cost");
  if (error) throw new Error(`getRewards: ${error.message}`);
  return data;
}

export async function getStores(): Promise<Store[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  const { data, error } = await createPublicClient()
    .from("stores")
    .select("id, name, address_line, city, postal_code, phone")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(`getStores: ${error.message}`);
  return data;
}

/** The default merchant's earn/redeem rules and tier ladder. */
export async function getMerchantRules(): Promise<MerchantRules> {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id, name, earn_rate_bps, point_value_paise, max_redeem_bps, signup_bonus_points")
    .eq("is_default", true)
    .eq("active", true)
    .single();
  if (error) throw new Error(`getMerchantRules: ${error.message}`);

  const { data: tiers, error: tierError } = await supabase
    .from("tiers")
    .select("id, name, min_lifetime_points, multiplier_bps")
    .eq("merchant_id", merchant.id)
    .order("min_lifetime_points");
  if (tierError) throw new Error(`getMerchantRules tiers: ${tierError.message}`);

  return {
    id: merchant.id,
    name: merchant.name,
    earnRateBps: merchant.earn_rate_bps,
    pointValuePaise: merchant.point_value_paise,
    maxRedeemBps: merchant.max_redeem_bps,
    signupBonusPoints: merchant.signup_bonus_points,
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      minLifetimePoints: t.min_lifetime_points,
      multiplierBps: t.multiplier_bps,
    })),
  };
}

/** Rewards are live when inside their optional [starts_at, ends_at) window. */
export function isRewardLive(reward: Pick<Reward, "starts_at" | "ends_at">, now: Date): boolean {
  if (reward.starts_at && new Date(reward.starts_at) > now) return false;
  if (reward.ends_at && new Date(reward.ends_at) <= now) return false;
  return true;
}
