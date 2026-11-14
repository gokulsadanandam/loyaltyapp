import "server-only";

import type { Enums } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export interface OrderDetail {
  id: string;
  status: Enums<"order_status">;
  createdAt: string;
  subtotalPaise: number;
  pointsRedeemed: number;
  pointsDiscountPaise: number;
  totalPaise: number;
  pointsEarned: number;
  store: { name: string; addressLine: string; city: string } | null;
  items: {
    id: number;
    name: string;
    qty: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }[];
}

export interface OrderSummary {
  id: string;
  status: Enums<"order_status">;
  createdAt: string;
  totalPaise: number;
  itemCount: number;
}

/** RLS limits this to the caller's own orders (or staff of the merchant). */
export async function getOrder(orderId: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, created_at, subtotal_paise, points_redeemed, points_discount_paise, total_paise, points_earned, store:stores(name, address_line, city), items:order_items(id, name_snapshot, qty, unit_price_paise, line_total_paise)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`getOrder: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    createdAt: data.created_at,
    subtotalPaise: data.subtotal_paise,
    pointsRedeemed: data.points_redeemed,
    pointsDiscountPaise: data.points_discount_paise,
    totalPaise: data.total_paise,
    pointsEarned: data.points_earned,
    store: data.store
      ? { name: data.store.name, addressLine: data.store.address_line, city: data.store.city }
      : null,
    items: data.items
      .toSorted((a, b) => a.id - b.id)
      .map((item) => ({
        id: item.id,
        name: item.name_snapshot,
        qty: item.qty,
        unitPricePaise: item.unit_price_paise,
        lineTotalPaise: item.line_total_paise ?? item.unit_price_paise * item.qty,
      })),
  };
}

export async function getRecentOrders(limit = 10): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, created_at, total_paise, items:order_items(qty)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentOrders: ${error.message}`);
  return data.map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.created_at,
    totalPaise: o.total_paise,
    itemCount: o.items.reduce((sum, item) => sum + item.qty, 0),
  }));
}
