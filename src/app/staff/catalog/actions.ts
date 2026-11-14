"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { REWARDS_TAG } from "@/lib/data/catalog";
import { getStaffContext, type StaffContext } from "@/lib/data/staff";
import { errorCode, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { productSchema, referralSettingsSchema, rewardSchema } from "@/lib/validation/catalog";

/**
 * Catalog writes. RLS is the real gate (insert/update on products and rewards:
 * owner/admin; merchants: owner). The role checks here only give a clean error.
 */

type FieldErrors = Record<string, string[] | undefined>;
type SaveResult = ActionResult<{ id: string }> & { fieldErrors?: FieldErrors };

async function requireCatalogEditor(): Promise<StaffContext | null> {
  const ctx = await getStaffContext();
  return ctx && (ctx.role === "owner" || ctx.role === "admin") ? ctx : null;
}

const forbidden = { ok: false as const, error: "Only owners and admins can edit the catalog." };

function invalid(error: z.ZodError): Failure {
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

interface Failure {
  ok: false;
  error: string;
  fieldErrors?: FieldErrors;
}

function dbFailure(error: { code?: string; message: string }, context: string): Failure {
  console.warn(`${context} failed`, { code: error.code, id: errorCode(error) });
  if (error.code === "23505") {
    return {
      ok: false,
      error: "That SKU is already in use.",
      fieldErrors: { sku: ["Already in use."] },
    };
  }
  if (error.code === "42501") return forbidden;
  return { ok: false, error: "Couldn't save. Please try again." };
}

/** Public catalog pages are cached; expire them so shoppers see the change now. */
function revalidateCatalog() {
  updateTag("catalog");
  updateTag(REWARDS_TAG);
}

export async function saveProduct(input: Record<string, unknown>): Promise<SaveResult> {
  const ctx = await requireCatalogEditor();
  if (!ctx) return forbidden;
  const parsed = productSchema(ctx.merchantId).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const p = parsed.data;

  const row = {
    merchant_id: ctx.merchantId,
    sku: p.sku,
    name: p.name,
    short_name: p.shortName,
    category: p.category,
    description: p.description,
    specs: p.specs,
    list_price_paise: p.listPrice,
    sale_price_paise: p.salePrice,
    image_path: p.imagePath,
    active: p.active,
  };

  const supabase = await createClient();
  const result = p.id
    ? await supabase
        .from("products")
        .update(row)
        .eq("id", p.id)
        .eq("merchant_id", ctx.merchantId)
        .select("id")
        .single()
    : await supabase.from("products").insert(row).select("id").single();
  if (result.error) return dbFailure(result.error, "saveProduct");

  revalidateCatalog();
  return { ok: true, data: { id: result.data.id } };
}

const toggleSchema = z.object({ id: z.uuid(), active: z.boolean() });

export async function setProductActive(input: z.input<typeof toggleSchema>): Promise<ActionResult> {
  const ctx = await requireCatalogEditor();
  if (!ctx) return forbidden;
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.id)
    .eq("merchant_id", ctx.merchantId);
  if (error) return dbFailure(error, "setProductActive");
  revalidateCatalog();
  return { ok: true };
}

export async function saveReward(input: Record<string, unknown>): Promise<SaveResult> {
  const ctx = await requireCatalogEditor();
  if (!ctx) return forbidden;
  const parsed = rewardSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = parsed.data;

  const row = {
    merchant_id: ctx.merchantId,
    name: r.name,
    description: r.description,
    points_cost: r.pointsCost,
    stock: r.stock,
    product_id: r.productId,
    starts_at: r.startsAt,
    ends_at: r.endsAt,
    active: r.active,
  };

  const supabase = await createClient();
  const result = r.id
    ? await supabase
        .from("rewards")
        .update(row)
        .eq("id", r.id)
        .eq("merchant_id", ctx.merchantId)
        .select("id")
        .single()
    : await supabase.from("rewards").insert(row).select("id").single();
  if (result.error) return dbFailure(result.error, "saveReward");

  revalidateCatalog();
  return { ok: true, data: { id: result.data.id } };
}

export async function setRewardActive(input: z.input<typeof toggleSchema>): Promise<ActionResult> {
  const ctx = await requireCatalogEditor();
  if (!ctx) return forbidden;
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.id)
    .eq("merchant_id", ctx.merchantId);
  if (error) return dbFailure(error, "setRewardActive");
  revalidateCatalog();
  return { ok: true };
}

export async function saveReferralSettings(input: Record<string, unknown>): Promise<SaveResult> {
  const ctx = await getStaffContext();
  if (ctx?.role !== "owner") {
    return { ok: false, error: "Only the owner can change the referral programme." };
  }
  const parsed = referralSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("merchants")
    .update({
      referral_referrer_points: parsed.data.referrerPoints,
      referral_referee_points: parsed.data.refereePoints,
      referral_min_order_paise: parsed.data.minOrder,
    })
    .eq("id", ctx.merchantId);
  if (error) return dbFailure(error, "saveReferralSettings");
  // Referral terms are shown on the cached signup/account pages.
  updateTag("catalog");
  return { ok: true, data: { id: ctx.merchantId } };
}
