"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getMerchantRules } from "@/lib/data/catalog";
import { getStaffContext, lookupMember, type MemberLookup } from "@/lib/data/staff";
import { errorCode, userMessage, type ActionResult } from "@/lib/errors";
import { pointsForSpend } from "@/lib/points";
import { looksLikeMemberToken, verifyMemberToken } from "@/lib/member-token";
import { qrSecret } from "@/lib/server-env";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff actions. getStaffContext() is a fast fail for the UI; the RPCs are the
 * real gate (fulfill: any staff role, refund: owner/admin, award: any staff and
 * never yourself), checked against merchant_staff inside the database.
 */

const notStaff = { ok: false as const, error: userMessage({ message: "forbidden" }) };

const orderIdSchema = z.uuid();

export async function fulfillOrder(orderId: string): Promise<ActionResult<{ earned: number }>> {
  if (!orderIdSchema.safeParse(orderId).success) return { ok: false, error: "Order not found." };
  if (!(await getStaffContext())) return notStaff;

  const supabase = await createClient();
  const { error } = await supabase.rpc("fulfill_order", { p_order_id: orderId });
  if (error) {
    console.warn("fulfill_order failed", { code: errorCode(error) });
    return { ok: false, error: userMessage(error) };
  }
  const { data: order } = await supabase
    .from("orders")
    .select("points_earned")
    .eq("id", orderId)
    .single();
  refresh();
  return { ok: true, data: { earned: order?.points_earned ?? 0 } };
}

const refundSchema = z.object({
  orderId: z.uuid(),
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(500),
});

export async function refundOrder(
  input: z.input<typeof refundSchema>,
): Promise<ActionResult<{ status: string }>> {
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the refund details.",
    };
  }
  if (!(await getStaffContext())) return notStaff;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("refund_order", {
    p_order_id: parsed.data.orderId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    console.warn("refund_order failed", { code: errorCode(error) });
    return { ok: false, error: userMessage(error) };
  }
  refresh();
  return { ok: true, data: { status: data } };
}

const memberCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,20}$/, "Member codes are letters and numbers.");

export async function findMember(code: string): Promise<ActionResult<MemberLookup>> {
  // A scanned QR token resolves to the member code it was issued for.
  if (looksLikeMemberToken(code.trim())) {
    const check = verifyMemberToken(qrSecret(), code);
    if (!check.ok) {
      return {
        ok: false,
        error:
          check.reason === "expired"
            ? "That QR code has expired. Ask the customer to refresh their account page."
            : "That QR code isn't valid.",
      };
    }
    code = check.memberCode;
  }
  const parsed = memberCodeSchema.safeParse(code);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid code." };
  const ctx = await getStaffContext();
  if (!ctx) return notStaff;
  const member = await lookupMember(ctx, parsed.data);
  return member
    ? { ok: true, data: member }
    : { ok: false, error: userMessage({ message: "member_not_found" }) };
}

/** "1499.5" -> 149950. Input already matches /^\d{1,6}(\.\d{1,2})?$/. */
function rupeesToPaise(value: string): number {
  const [rupees = "0", paise = ""] = value.split(".");
  return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
}

const awardSchema = z.object({
  memberCode: memberCodeSchema,
  // Parsed as text to exact integer paise; no floating point near money.
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,6}(\.\d{1,2})?$/, "Enter the bill amount, e.g. 1499 or 1499.50.")
    .transform(rupeesToPaise)
    .refine((paise) => paise > 0 && paise <= 10_000_000, "Enter an amount up to ₹1,00,000."),
  storeId: z.uuid().optional(),
  idempotencyKey: z.uuid(),
});

export async function awardPoints(
  input: z.input<typeof awardSchema>,
): Promise<ActionResult<{ points: number; memberName: string }>> {
  const parsed = awardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const ctx = await getStaffContext();
  if (!ctx) return notStaff;

  const { memberCode, amount: amountPaise, storeId, idempotencyKey } = parsed.data;
  // Read the member's tier BEFORE awarding: the RPC prices the award at the current
  // tier, and the award itself can move them up a tier (wrong multiplier afterwards).
  const [member, rules] = await Promise.all([lookupMember(ctx, memberCode), getMerchantRules()]);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_award_points", {
    p_member_code: memberCode,
    p_amount_paise: amountPaise,
    p_idempotency_key: idempotencyKey,
    ...(storeId ? { p_store_id: storeId } : {}),
  });
  if (error) {
    console.warn("staff_award_points failed", { code: errorCode(error) });
    return { ok: false, error: userMessage(error) };
  }

  // Cashiers can't read ledger lines (RLS: owner/admin only), so mirror the RPC's
  // formula with the pre-award tier to show what was awarded.
  const points = member
    ? pointsForSpend(amountPaise, {
        earnRateBps: rules.earnRateBps,
        multiplierBps: member.multiplierBps,
      })
    : 0;
  return { ok: true, data: { points, memberName: member?.name ?? "Member" } };
}
