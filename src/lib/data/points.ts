import "server-only";

import { getAccountSummary } from "@/lib/data/account";
import type { Enums } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export interface PointsEntry {
  id: number;
  /** Signed, from the customer's point of view (+ earned, − spent/expired). */
  points: number;
  kind: Enums<"ledger_txn_kind">;
  reason: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

export const PAGE_SIZE = 25;

/**
 * The caller's ledger lines, newest first. Reads the customer leg of each
 * double-entry transaction, filtered to the caller's own ledger account (RLS
 * also lets staff read merchant ledgers, so the filter is explicit).
 */
export async function getPointsHistory(
  before?: string,
): Promise<{ entries: PointsEntry[]; nextCursor: string | null }> {
  const summary = await getAccountSummary();
  if (!summary) return { entries: [], nextCursor: null };
  const supabase = await createClient();

  // Resolve the customer ledger account first so the entries query can use the
  // (ledger_account_id, created_at DESC) index instead of filtering through a join.
  const { data: ledgerAccount, error: accountError } = await supabase
    .from("ledger_accounts")
    .select("id")
    .eq("loyalty_account_id", summary.accountId)
    .eq("kind", "customer")
    .single();
  if (accountError) throw new Error(`getPointsHistory account: ${accountError.message}`);

  let query = supabase
    .from("ledger_entries")
    .select("id, amount, created_at, txn:ledger_transactions!inner(kind, reason, ref_type, ref_id)")
    .eq("ledger_account_id", ledgerAccount.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  // Keyset on (created_at, id): a refund posts two transactions in one database
  // transaction, so they share created_at; paging on the timestamp alone skips one.
  const cursor = parseCursor(before);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`getPointsHistory: ${error.message}`);

  const page = data.slice(0, PAGE_SIZE);
  return {
    entries: page.map((row) => ({
      id: row.id,
      points: row.amount,
      kind: row.txn.kind,
      reason: row.txn.reason,
      refType: row.txn.ref_type,
      refId: row.txn.ref_id,
      createdAt: row.created_at,
    })),
    nextCursor: (() => {
      const last = page.at(-1);
      return data.length > PAGE_SIZE && last ? `${last.created_at}|${String(last.id)}` : null;
    })(),
  };
}

// Postgres timestamptz as PostgREST returns it, microseconds included. Kept verbatim:
// re-serialising through Date would truncate to milliseconds and break the keyset.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** Cursor is "<created_at>|<entry id>"; anything else is ignored (first page). */
export function parseCursor(raw: string | undefined) {
  if (!raw) return null;
  const [createdAt, id, ...rest] = raw.split("|");
  if (rest.length > 0 || !createdAt || !id || !TIMESTAMP.test(createdAt) || !/^\d{1,18}$/.test(id))
    return null;
  return { createdAt, id };
}

const LABELS: Record<Enums<"ledger_txn_kind">, string> = {
  signup: "Welcome bonus",
  earn: "Earned on order",
  earn_reversal: "Earned points reversed (refund)",
  redeem: "Redeemed",
  redeem_reversal: "Redeemed points returned (refund)",
  expire: "Expired",
  adjust: "Adjustment",
  referral: "Referral bonus",
  migration: "Migrated balance",
};

export function entryLabel(entry: Pick<PointsEntry, "kind" | "refType">): string {
  if (entry.kind === "redeem" && entry.refType === "reward_redemption") return "Reward redeemed";
  if (entry.kind === "redeem" && entry.refType === "order") return "Used at checkout";
  if (entry.kind === "earn" && entry.refType === "loyalty_account") return "Earned in store";
  if (entry.kind === "referral" && entry.refType === "order")
    return "Referral bonus: your first order";
  if (entry.kind === "referral") return "Referral bonus: a friend's first order";
  return LABELS[entry.kind];
}
