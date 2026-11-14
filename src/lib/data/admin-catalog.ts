import "server-only";

import type { Tables } from "@/lib/database.types";
import type { StaffContext } from "@/lib/data/staff";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin catalog reads, including inactive rows (RLS: staff of the merchant may
 * read inactive products/rewards; customers and anon see active ones only).
 */

export type AdminProduct = Pick<
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
  | "active"
  | "updated_at"
>;

export type AdminReward = Pick<
  Tables<"rewards">,
  | "id"
  | "name"
  | "description"
  | "points_cost"
  | "stock"
  | "product_id"
  | "starts_at"
  | "ends_at"
  | "active"
  | "updated_at"
>;

const PRODUCT_COLUMNS =
  "id, sku, name, short_name, category, description, specs, list_price_paise, sale_price_paise, image_path, active, updated_at";
const REWARD_COLUMNS =
  "id, name, description, points_cost, stock, product_id, starts_at, ends_at, active, updated_at";

export async function listProducts(ctx: StaffContext): Promise<AdminProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("merchant_id", ctx.merchantId)
    .order("sku");
  if (error) throw new Error(`listProducts: ${error.message}`);
  return data;
}

export async function getProduct(ctx: StaffContext, id: string): Promise<AdminProduct | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("merchant_id", ctx.merchantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProduct: ${error.message}`);
  return data;
}

export async function listRewards(ctx: StaffContext): Promise<AdminReward[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rewards")
    .select(REWARD_COLUMNS)
    .eq("merchant_id", ctx.merchantId)
    .order("points_cost");
  if (error) throw new Error(`listRewards: ${error.message}`);
  return data;
}

export async function getReward(ctx: StaffContext, id: string): Promise<AdminReward | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rewards")
    .select(REWARD_COLUMNS)
    .eq("merchant_id", ctx.merchantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getReward: ${error.message}`);
  return data;
}

export interface ReferralSettings {
  referrerPoints: number;
  refereePoints: number;
  minOrderPaise: number;
}

export async function getReferralSettings(ctx: StaffContext): Promise<ReferralSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("merchants")
    .select("referral_referrer_points, referral_referee_points, referral_min_order_paise")
    .eq("id", ctx.merchantId)
    .single();
  if (error) throw new Error(`getReferralSettings: ${error.message}`);
  return {
    referrerPoints: data.referral_referrer_points,
    refereePoints: data.referral_referee_points,
    minOrderPaise: data.referral_min_order_paise,
  };
}
