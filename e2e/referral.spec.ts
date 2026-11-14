import { expect, test } from "@playwright/test";

import { gotoHydrated, OWNER, pointsBalance, signIn, signUpAndConfirm } from "./helpers";

test.beforeEach(() => {
  test.slow();
});

test("referral: both earn when the friend's first order is completed", async ({
  page,
  browser,
}) => {
  // Referrer signs up and copies their link from the account page.
  await signUpAndConfirm(page);
  await gotoHydrated(page, "/account");
  const link = (await page.getByTestId("referral-link").innerText()).trim();
  const code = new URL(link).searchParams.get("ref");
  expect(code).toMatch(/^[A-Z0-9]{8}$/);

  // Friend opens the link: offer shown, code prefilled, signs up.
  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await gotoHydrated(friend, `/signup?ref=${code ?? ""}`);
  await expect(friend.getByTestId("referral-offer")).toContainText("extra 100 pts");
  await expect(friend.getByLabel("Referral code (optional)")).toHaveValue(code ?? "");
  await signUpAndConfirm(friend, undefined, { referralCode: code ?? "" });

  // Friend orders ₹1,200 (over the ₹500 minimum) for pickup.
  await gotoHydrated(friend, "/products/LGC-002");
  await friend.getByRole("button", { name: "Add to cart" }).click();
  await expect(friend.getByRole("button", { name: "Add another (1 in cart)" })).toBeEnabled();
  await gotoHydrated(friend, "/checkout");
  await friend.getByRole("button", { name: /place order · ₹1,200/i }).click();
  await friend.waitForURL(/\/orders\/([0-9a-f-]{36})\?placed=1$/);
  const orderId = /\/orders\/([0-9a-f-]{36})/.exec(friend.url())?.[1] ?? "";

  // Referrer's dashboard: one friend joined, nothing rewarded yet.
  await page.reload();
  const stats = page.getByRole("definition");
  await expect(stats.nth(0)).toHaveText("1");
  await expect(stats.nth(1)).toHaveText("0");

  // Staff complete the order at the counter.
  const staff = await (await browser.newContext()).newPage();
  await signIn(staff, OWNER.email, OWNER.password);
  await gotoHydrated(staff, "/staff/orders");
  await staff
    .getByTestId(`staff-order-${orderId}`)
    .getByRole("button", { name: /collected and paid/i })
    .click();
  await expect(staff.getByText(/customer earned 120 pts/i)).toBeVisible();

  // Friend: 100 signup + 120 earned + 100 referral.
  await gotoHydrated(friend, "/account/points");
  expect(await pointsBalance(friend)).toBe(320);
  await expect(friend.getByRole("list", { name: "Points activity" })).toContainText(
    "Referral bonus: your first order",
  );

  // Referrer: 100 signup + 200 referral, and the stats update.
  await gotoHydrated(page, "/account");
  expect(await pointsBalance(page)).toBe(300);
  await expect(stats.nth(1)).toHaveText("1");
  await expect(stats.nth(2)).toHaveText("200 pts");
  await gotoHydrated(page, "/account/points");
  await expect(page.getByRole("list", { name: "Points activity" })).toContainText(
    "Referral bonus: a friend's first order",
  );

  await friendCtx.close();
  await staff.context().close();
});

test("an invalid referral code doesn't block signup", async ({ page }) => {
  await signUpAndConfirm(page, undefined, { referralCode: "NOSUCHCODE" });
  expect(await pointsBalance(page)).toBe(100);
});
