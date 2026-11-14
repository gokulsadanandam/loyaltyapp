import { expect, test } from "@playwright/test";

import { CASHIER, gotoHydrated, OWNER, signIn } from "./helpers";

test.beforeEach(() => {
  test.slow();
});

test("owner sees KPIs, the points chart, its data table and range filter", async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  await gotoHydrated(page, "/staff/analytics");

  // Seeded members alone guarantee non-trivial figures.
  await expect(page.getByTestId("kpi-liability")).toHaveText(/^₹[\d,.]+$/);
  await expect(page.getByTestId("kpi-redemption")).toHaveText(/^\d{1,3}%$/);
  await expect(page.getByTestId("kpi-active")).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId("kpi-repeat")).toHaveText(/^\d{1,3}%$/);

  const chart = page.getByRole("img", { name: /points issued and redeemed per day/i });
  await expect(chart).toBeVisible();

  // Keyboard reaches each day; focus shows the readout for both series.
  await chart.locator("g[tabindex='0']").last().focus();
  await expect(page.getByRole("status").filter({ hasText: "Issued" })).toContainText("Redeemed");

  // Table view: one row per day in the window.
  await page.getByText("Show data table").click();
  await expect(page.locator("table tbody tr")).toHaveCount(30);

  await page.getByRole("link", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/days=7$/);
  await expect(page.locator("table tbody tr")).toHaveCount(7);
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const tiers = page.getByRole("list", { name: "Members by tier" });
  await expect(tiers.getByRole("meter")).toHaveCount(3);
});

test("cashiers can't open analytics", async ({ page }) => {
  await signIn(page, CASHIER.email, CASHIER.password);
  await page.goto("/staff/analytics");
  await expect(page.getByRole("heading", { name: /couldn.t find that page/i })).toBeVisible();
});
