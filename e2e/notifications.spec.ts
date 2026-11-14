import { expect, test, type Browser, type Page } from "@playwright/test";

import { gotoHydrated, OWNER, signIn, signUpAndConfirm } from "./helpers";

const MAILPIT = "http://127.0.0.1:54324";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

test.beforeEach(() => {
  test.slow();
});

/** Owner awards an in-store purchase; ₹19,000 at 1× = 1,900 pts -> 2,000 lifetime = Gold. */
async function pushToGold(browser: Browser, memberCode: string) {
  const staff = await (await browser.newContext()).newPage();
  await signIn(staff, OWNER.email, OWNER.password);
  await gotoHydrated(staff, "/staff/award");
  await staff.getByLabel("Member code").fill(memberCode);
  await staff.getByRole("button", { name: "Find member" }).click();
  await staff.getByLabel("Bill amount (₹)").fill("19000");
  await staff.getByRole("button", { name: "Award points" }).click();
  await expect(staff.getByRole("status")).toContainText("1,900 pts awarded");
  await staff.context().close();
}

async function memberCode(page: Page) {
  await gotoHydrated(page, "/account");
  return (await page.getByTestId("member-code").innerText()).trim();
}

async function deliver(page: Page) {
  const res = await page.request.post("/api/notifications/deliver", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as { claimed: number; sent: number; failed: number };
}

async function mailCount(page: Page, to: string, subject: string) {
  const res = await page.request.get(`${MAILPIT}/api/v1/search`, {
    params: { query: `to:"${to}" subject:"${subject}"` },
  });
  return ((await res.json()) as { messages: unknown[] }).messages.length;
}

test.beforeAll(() => {
  if (CRON_SECRET.length < 24) throw new Error("Set CRON_SECRET in .env.local");
});

test("tier up: in-app notification, read state, and email delivery", async ({ page, browser }) => {
  const user = await signUpAndConfirm(page);
  await pushToGold(browser, await memberCode(page));

  // Bell shows the unread notification.
  await gotoHydrated(page, "/");
  await expect(page.getByTestId("unread-count")).toHaveText("1");
  await page.getByRole("link", { name: /notifications, 1 unread/i }).click();
  await page.waitForURL("/notifications");
  const feed = page.getByRole("list", { name: "Notifications" });
  await expect(feed).toContainText("Welcome to Gold");
  await expect(feed).toContainText("1.25× points");

  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByTestId("unread-count")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);

  // The worker emails it (to Mailpit locally), exactly once.
  const result = await deliver(page);
  expect(result.failed).toBe(0);
  await expect.poll(() => mailCount(page, user.email, "Welcome to Gold")).toBe(1);
  await deliver(page);
  expect(await mailCount(page, user.email, "Welcome to Gold")).toBe(1);
});

test("members who turn email off still get in-app notifications", async ({ page, browser }) => {
  const user = await signUpAndConfirm(page);
  const code = await memberCode(page);

  await gotoHydrated(page, "/notifications");
  await page.getByLabel("Also send these by email").uncheck();
  await expect(page.getByText("Email notifications off.")).toBeVisible();

  await pushToGold(browser, code);
  await gotoHydrated(page, "/notifications");
  await expect(page.getByRole("list", { name: "Notifications" })).toContainText("Welcome to Gold");

  await deliver(page);
  expect(await mailCount(page, user.email, "Welcome to Gold")).toBe(0);
});

test("the delivery endpoint rejects callers without the cron secret", async ({ request }) => {
  expect((await request.post("/api/notifications/deliver")).status()).toBe(401);
  expect(
    (
      await request.get("/api/notifications/deliver", {
        headers: { Authorization: "Bearer not-the-secret-not-the-secret" },
      })
    ).status(),
  ).toBe(401);
});
