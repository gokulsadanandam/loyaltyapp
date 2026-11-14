import { expect, test } from "@playwright/test";

import { gotoHydrated, pointsBalance, signUpAndConfirm } from "./helpers";

test("browse, cart, and checkout with points (location denied)", async ({ page }) => {
  await signUpAndConfirm(page);

  // LGC-002: ₹1,200 sale price in the seed.
  await gotoHydrated(page, "/products/LGC-002");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.getByRole("button", { name: /add another/i }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("2");
  // The badge is optimistic; wait for the write to land before a full page load aborts it.
  await expect(page.getByRole("button", { name: "Add another (2 in cart)" })).toBeEnabled();

  await page.goto("/cart");
  // Optimistic UI updates first; wait for the actual cart_items write before reloading.
  const written = page.waitForResponse(
    (r) => r.url().includes("/rest/v1/cart_items") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Decrease quantity" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  expect((await written).ok()).toBe(true);
  // Persisted server-side, not just optimistic.
  await page.reload();
  await expect(page.getByRole("group", { name: /quantity for/i }).locator("output")).toHaveText(
    "1",
  );

  await page.getByRole("link", { name: "Checkout" }).click();
  await page.waitForURL("/checkout");

  // No geolocation permission in this context: checkout must still work.
  await page.getByRole("button", { name: "Nearest to me" }).click();
  await expect(page.getByText(/pick a store from the list/i)).toBeVisible();
  await page.getByRole("radio", { name: /koramangala/i }).click();
  await expect(page.getByRole("radio", { name: /koramangala/i })).toBeChecked();

  await page.getByRole("button", { name: "Use max" }).click();
  await expect(page.getByLabel("Points to redeem")).toHaveValue("100");
  // ₹1,200 − 100 pts × ₹0.25 = ₹1,175.
  const placeOrder = page.getByRole("button", { name: /place order · ₹1,175/i });
  await expect(placeOrder).toBeVisible();
  await placeOrder.click();

  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?placed=1$/);
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  await expect(page.getByText("Awaiting pickup")).toBeVisible();
  await expect(page.getByText("Koramangala").first()).toBeVisible();
  await expect(page.getByTestId("cart-count")).toHaveCount(0);
  expect(await pointsBalance(page)).toBe(0);

  // The order shows up in account history.
  await page.goto("/account");
  await expect(page.getByRole("link", { name: /₹1,175/ })).toBeVisible();
});

test("checkout rejects more points than allowed", async ({ page }) => {
  await signUpAndConfirm(page);
  await gotoHydrated(page, "/products/LGC-002");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await expect(page.getByRole("button", { name: "Add another (1 in cart)" })).toBeEnabled();

  await gotoHydrated(page, "/checkout");
  await page.getByLabel("Points to redeem").fill("500");
  await page.getByRole("button", { name: /place order/i }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "You can use up to 100 pts on this order.",
  );
  expect(await pointsBalance(page)).toBe(100);
});

test("signed-out add to cart sends you to login", async ({ page }) => {
  await gotoHydrated(page, "/products/LGC-001");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fproducts%2FLGC-001$/);
});

test("catalog renders from the database with cleaned prices", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Shop the collection" })).toBeVisible();
  // The 19 seeded products (catalog E2E tests may add others in parallel).
  await expect(page.locator('#main li a[href^="/products/LGC-"]')).toHaveCount(19);
  // LGC-009 typo fix (Phase 1 seed): ₹15,000 list / ₹11,000 sale, not ₹1,100.
  await page.goto("/products/LGC-009");
  await expect(page.getByText("₹11,000").first()).toBeVisible();
  await expect(page.getByText("₹15,000").first()).toBeVisible();
});
