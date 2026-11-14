import { expect, test, type Browser, type Page } from "@playwright/test";

import { gotoHydrated, OWNER, pointsBalance, signIn, signUpAndConfirm } from "./helpers";

// Each test drives two users end to end (signup + email confirmation, order, staff
// sign-in, action, customer check): give them triple the default budget.
test.beforeEach(() => {
  test.slow();
});

async function staffPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, OWNER.email, OWNER.password);
  return page;
}

/** Customer places a ₹1,200 pickup order without points; returns the order id. */
async function placeOrder(page: Page): Promise<string> {
  await gotoHydrated(page, "/products/LGC-002");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("button", { name: "Add another (1 in cart)" })).toBeEnabled();
  await gotoHydrated(page, "/checkout");
  await page.getByRole("button", { name: /place order · ₹1,200/i }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?placed=1$/);
  const id = /\/orders\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!id) throw new Error("no order id");
  return id;
}

test("staff complete an order and the customer earns points", async ({ page, browser }) => {
  await signUpAndConfirm(page);
  const orderId = await placeOrder(page);

  const staff = await staffPage(browser);
  await gotoHydrated(staff, "/staff/orders");
  const row = staff.getByTestId(`staff-order-${orderId}`);
  await expect(row).toContainText("Collect ₹1,200");
  await row.getByRole("button", { name: /collected and paid/i }).click();
  await expect(staff.getByText(/completed\. customer earned 120 pts/i)).toBeVisible();
  await gotoHydrated(staff, "/staff/orders?status=fulfilled");
  await expect(staff.getByTestId(`staff-order-${orderId}`)).toContainText("Completed");

  // Customer side: 100 signup + 120 earned.
  await gotoHydrated(page, "/account/points");
  expect(await pointsBalance(page)).toBe(220);
  const activity = page.getByRole("list", { name: "Points activity" });
  await expect(activity.getByRole("listitem").first()).toContainText("Earned on order");
  await expect(activity.getByRole("listitem").first()).toContainText("+120 pts");
  await expect(activity).toContainText("Welcome bonus");
  await staff.context().close();
});

test("owner refunds a completed order with a reason", async ({ page, browser }) => {
  await signUpAndConfirm(page);
  const orderId = await placeOrder(page);

  const staff = await staffPage(browser);
  await gotoHydrated(staff, "/staff/orders");
  const row = staff.getByTestId(`staff-order-${orderId}`);
  await row.getByRole("button", { name: /collected and paid/i }).click();
  await expect(staff.getByText(/customer earned 120 pts/i)).toBeVisible();

  await gotoHydrated(staff, "/staff/orders?status=fulfilled");
  await staff.getByTestId(`staff-order-${orderId}`).getByRole("button", { name: "Refund" }).click();
  const dialog = staff.getByRole("dialog");
  await dialog.getByRole("button", { name: "Refund order" }).click();
  await expect(dialog.getByRole("alert")).toContainText("at least 5 characters");
  await dialog.getByLabel("Reason").fill("Item returned unopened");
  await dialog.getByRole("button", { name: "Refund order" }).click();
  await expect(staff.getByText(/refunded\./i)).toBeVisible();

  // Earned points clawed back: back to the 100 signup points.
  await gotoHydrated(page, "/account/points");
  expect(await pointsBalance(page)).toBe(100);
  await expect(page.getByRole("list", { name: "Points activity" })).toContainText(
    "Earned points reversed (refund)",
  );
  await staff.context().close();
});

test("staff award in-store points by member code", async ({ page, browser }) => {
  await signUpAndConfirm(page);
  await gotoHydrated(page, "/account");
  const memberCode = (await page.getByTestId("member-code").innerText()).trim();

  const staff = await staffPage(browser);
  await gotoHydrated(staff, "/staff/award");
  await staff.getByLabel("Member code").fill("NOSUCHCODE1");
  await staff.getByRole("button", { name: "Find member" }).click();
  await expect(staff.getByRole("main").getByRole("alert")).toContainText(
    "No member with that code.",
  );

  await staff.getByLabel("Member code").fill(memberCode);
  await staff.getByRole("button", { name: "Find member" }).click();
  await expect(staff.getByTestId("member-found")).toContainText("Test");
  await staff.getByLabel("Bill amount (₹)").fill("499.50");
  await staff.getByRole("button", { name: "Award points" }).click();
  await expect(staff.getByRole("status")).toContainText("49 pts awarded to Test");

  await gotoHydrated(page, "/account/points");
  expect(await pointsBalance(page)).toBe(149);
  await expect(page.getByRole("list", { name: "Points activity" })).toContainText(
    "Earned in store",
  );
  await staff.context().close();
});

test("staff cannot award points to themselves", async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  await gotoHydrated(page, "/account");
  const ownCode = (await page.getByTestId("member-code").innerText()).trim();
  await gotoHydrated(page, "/staff/award");
  await page.getByLabel("Member code").fill(ownCode);
  await page.getByRole("button", { name: "Find member" }).click();
  await page.getByLabel("Bill amount (₹)").fill("1000");
  await page.getByRole("button", { name: "Award points" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "You can't award points to your own account.",
  );
});

test("customers get a 404 for the staff console", async ({ page }) => {
  await signUpAndConfirm(page);
  const response = await page.goto("/staff/orders");
  await expect(page.getByRole("heading", { name: /couldn.t find that page/i })).toBeVisible();
  expect(response?.status()).toBe(200); // streamed: status is sent before notFound() renders
  await expect(page.getByRole("link", { name: "Staff console" })).toHaveCount(0);
});

test("staff can shop, and see only their own orders on their account", async ({
  page,
  browser,
}) => {
  // Regression: RLS lets staff read every account and order; customer views must filter.
  const customer = await (await browser.newContext()).newPage();
  await signUpAndConfirm(customer);
  const customerOrder = await placeOrder(customer);

  await signIn(page, OWNER.email, OWNER.password);
  await gotoHydrated(page, "/products/LGC-003");
  await page.getByRole("button", { name: /add to cart|add another/i }).click();
  await expect(page.getByText(/added .* to your cart/i)).toBeVisible();

  await gotoHydrated(page, "/account");
  await expect(page.getByRole("heading", { name: "Recent orders" })).toBeVisible();
  await expect(page.getByText(`#${customerOrder.slice(0, 8).toUpperCase()}`)).toHaveCount(0);
  await customer.context().close();
});
