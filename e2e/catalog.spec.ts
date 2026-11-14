import { expect, test } from "@playwright/test";

import { CASHIER, gotoHydrated, OWNER, signIn, signUpAndConfirm } from "./helpers";

const IMAGE =
  "supabase/storage/product-images/b0000000-0000-4000-8000-000000000001/products/bag_3.png";
const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

test.beforeEach(() => {
  test.slow();
});

test("owner creates a product with an image; it goes live and can be hidden", async ({ page }) => {
  const sku = `E2E-${uid()}`;
  await signIn(page, OWNER.email, OWNER.password);
  await gotoHydrated(page, "/staff/catalog/new");

  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Category").fill("bags");
  await page.getByLabel("Name", { exact: true }).fill(`E2E Travel Pack ${sku}`);
  await page.getByLabel("List price (₹)").fill("1999");
  await page.getByLabel("Sale price (₹)").fill("1499.50");
  await page.getByLabel("Specifications").fill("Capacity: 30 L\nWeight: 900 g");

  // Direct-to-storage upload as the signed-in owner.
  const uploaded = page.waitForResponse(
    (r) =>
      r.url().includes("/storage/v1/object/product-images/") && r.request().method() === "POST",
  );
  await page.locator("#p-image").setInputFiles(IMAGE);
  expect((await uploaded).ok()).toBe(true);
  await expect(page.getByText("Replace image")).toBeVisible();

  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForURL("/staff/catalog");
  await expect(page.getByTestId(`product-${sku}`)).toBeVisible();

  // Live in the shop immediately (cached catalog was invalidated).
  await gotoHydrated(page, `/products/${sku}`);
  await expect(page.getByRole("heading", { name: `E2E Travel Pack ${sku}` })).toBeVisible();
  await expect(page.getByText("₹1,499.5").first()).toBeVisible();
  await expect(page.getByText("Capacity: 30 L")).toBeVisible();
  await expect(page.getByRole("img", { name: `E2E Travel Pack ${sku}` })).toBeVisible();

  // Hide it: gone from the shop, still listed (as hidden) for staff.
  await gotoHydrated(page, "/staff/catalog");
  await page.getByRole("button", { name: `Hide E2E Travel Pack ${sku}` }).click();
  await expect(page.getByText(/is now hidden/)).toBeVisible();
  await expect(page.getByTestId(`product-${sku}`)).toContainText("Hidden");
  await gotoHydrated(page, `/products/${sku}`);
  await expect(page.getByRole("heading", { name: /couldn.t find that page/i })).toBeVisible();
});

test("product form validation: prices and duplicate SKU", async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  await gotoHydrated(page, "/staff/catalog/new");
  await page.getByLabel("SKU").fill("LGC-001"); // already exists
  await page.getByLabel("Category").fill("bags");
  await page.getByLabel("Name", { exact: true }).fill("Duplicate");
  await page.getByLabel("List price (₹)").fill("100");
  await page.getByLabel("Sale price (₹)").fill("150");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Sale price can't be above the list price.")).toBeVisible();

  await page.getByLabel("Sale price (₹)").fill("90");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("main").getByRole("alert").first()).toContainText(
    "That SKU is already in use.",
  );
  await expect(page).toHaveURL(/\/staff\/catalog\/new$/);
});

test("owner creates a reward; customers see it until it's hidden", async ({ page, browser }) => {
  const name = `E2E Coffee ${uid()}`;
  await signIn(page, OWNER.email, OWNER.password);
  await gotoHydrated(page, "/staff/rewards/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Points cost").fill("50");
  await page.getByLabel("Stock").fill("10");
  await page.getByRole("button", { name: "Create reward" }).click();
  await page.waitForURL("/staff/rewards");
  await expect(page.getByRole("list", { name: "Rewards" })).toContainText(name);

  const customer = await (await browser.newContext()).newPage();
  await signUpAndConfirm(customer);
  await gotoHydrated(customer, "/rewards");
  const card = customer.getByRole("listitem").filter({ hasText: name });
  await expect(card).toContainText("50 pts");
  await expect(card).toContainText("10 left");
  await expect(card.getByRole("button", { name: "Redeem" })).toBeEnabled();

  await gotoHydrated(page, "/staff/rewards");
  await page.getByRole("button", { name: `Hide ${name}` }).click();
  await expect(page.getByText(/is now hidden/)).toBeVisible();

  await gotoHydrated(customer, "/rewards");
  await expect(customer.getByText(name)).toHaveCount(0);
  await customer.context().close();
});

test("cashiers can't reach the catalog editor", async ({ page }) => {
  await signIn(page, CASHIER.email, CASHIER.password);
  await gotoHydrated(page, "/staff/orders");
  const nav = page.getByRole("navigation", { name: "Staff" });
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Catalog" })).toHaveCount(0);

  for (const path of ["/staff/catalog", "/staff/catalog/new", "/staff/rewards"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /couldn.t find that page/i })).toBeVisible();
  }
});
