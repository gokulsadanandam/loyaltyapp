import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Cart access shared by the server (checkout page) and the browser (TanStack
 * Query). Pass in whichever client fits; both act as the signed-in user, and RLS
 * restricts every statement to the caller's own cart. Prices shown here are for
 * display only: place_order re-reads them from `products`.
 */

type Client = SupabaseClient<Database>;

export interface CartLine {
  productId: string;
  qty: number;
  sku: string;
  name: string;
  imagePath: string | null;
  salePricePaise: number;
  listPricePaise: number;
  active: boolean;
}

export interface AccountRef {
  accountId: string;
  merchantId: string;
}

export const MAX_LINE_QTY = 10;

export async function fetchCart(supabase: Client): Promise<CartLine[]> {
  const { data, error } = await supabase
    .from("cart_items")
    .select(
      "product_id, qty, created_at, product:products(sku, name, image_path, sale_price_paise, list_price_paise, active)",
    )
    .order("created_at");
  if (error) throw error;
  return data.map((row) => ({
    productId: row.product_id,
    qty: row.qty,
    sku: row.product.sku,
    name: row.product.name,
    imagePath: row.product.image_path,
    salePricePaise: row.product.sale_price_paise,
    listPricePaise: row.product.list_price_paise,
    active: row.product.active,
  }));
}

/** The caller's account at the default merchant (needed as the cart's foreign key). */
export async function fetchAccountRef(supabase: Client): Promise<AccountRef> {
  const { data, error } = await supabase
    .from("loyalty_accounts")
    .select("id, merchant_id, merchant:merchants!inner(is_default)")
    .eq("merchant.is_default", true)
    .single();
  if (error) throw error;
  return { accountId: data.id, merchantId: data.merchant_id };
}

/** Sets a line's quantity; 0 removes it. Quantities are clamped to 1–10 by a CHECK constraint. */
export async function setCartQty(
  supabase: Client,
  account: AccountRef,
  productId: string,
  qty: number,
): Promise<void> {
  if (qty <= 0) {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("account_id", account.accountId)
      .eq("product_id", productId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("cart_items").upsert(
    {
      account_id: account.accountId,
      merchant_id: account.merchantId,
      product_id: productId,
      qty: Math.min(Math.trunc(qty), MAX_LINE_QTY),
    },
    { onConflict: "account_id,product_id" },
  );
  if (error) throw error;
}

export function cartSubtotal(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.salePricePaise * line.qty, 0);
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}
