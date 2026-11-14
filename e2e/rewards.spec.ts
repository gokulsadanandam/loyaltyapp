import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../src/lib/database.types";
import { gotoHydrated, pointsBalance, signUpAndConfirm, type TestUser } from "./helpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/**
 * Tops up a user's points the way production would: the seeded merchant owner
 * calls the audited admin_adjust RPC. No service key or direct table writes.
 */
async function grantPoints(user: TestUser, points: number) {
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient<Database>(SUPABASE_URL, KEY, opts);
  await asUser.auth.signInWithPassword({ email: user.email, password: user.password });
  const { data: account, error } = await asUser.from("loyalty_accounts").select("id").single();
  if (error) throw error;

  const asAdmin = createClient<Database>(SUPABASE_URL, KEY, opts);
  const signIn = await asAdmin.auth.signInWithPassword({
    email: "admin@example.com",
    password: "Password123",
  });
  if (signIn.error) throw signIn.error;
  const adjust = await asAdmin.rpc("admin_adjust", {
    p_account_id: account.id,
    p_points: points,
    p_reason: "e2e top-up",
    p_idempotency_key: crypto.randomUUID(),
  });
  if (adjust.error) throw adjust.error;
}

test.beforeAll(() => {
  if (!KEY) throw new Error("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.local)");
});

test("redeem a reward and get a claim code", async ({ page }) => {
  const user = await signUpAndConfirm(page);
  await grantPoints(user, 200); // 100 signup + 200 = 300

  await gotoHydrated(page, "/rewards");
  expect(await pointsBalance(page)).toBe(300);

  // Expired seed reward is filtered out; unaffordable one shows the gap.
  await expect(page.getByText("Launch week double voucher")).toHaveCount(0);
  const voucher = page.getByRole("listitem").filter({ hasText: "₹100 off voucher" });
  await expect(voucher.getByRole("button", { name: "100 pts to go" })).toBeDisabled();

  const giftWrap = page.getByRole("listitem").filter({ hasText: "Free gift wrap" });
  const stockText = await giftWrap.getByText(/\d+ left$/).innerText();
  const stockBefore = Number(/\d+/.exec(stockText)?.[0]);
  await giftWrap.getByRole("button", { name: "Redeem" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("150 pts will be deducted from your balance of 300 pts");
  await dialog.getByRole("button", { name: /redeem for 150 pts/i }).click();

  await expect(dialog.getByRole("heading", { name: "Reward redeemed" })).toBeVisible();
  await expect(dialog.getByTestId("redemption-code")).toHaveText(/^[2-9A-HJ-NP-Z]{12}$/);
  await dialog.getByRole("button", { name: "Done" }).click();

  await expect(page.getByTestId("points-balance")).toHaveText("150");
  await expect(giftWrap.getByText(`${String(stockBefore - 1)} left`)).toBeVisible();
});

test("signed-out visitors see rewards but must sign in to redeem", async ({ page }) => {
  await page.goto("/rewards");
  await expect(page.getByRole("link", { name: "Sign in to redeem" }).first()).toBeVisible();
});
