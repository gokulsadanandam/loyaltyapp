import { expect, test } from "@playwright/test";

import { gotoHydrated, latestAuthLink, newUser, pointsBalance, signUpAndConfirm } from "./helpers";

test("signup → email confirmation → signed in with the welcome bonus", async ({ page }) => {
  await signUpAndConfirm(page);
  await expect(page.getByText(/welcome! your account is active/i)).toBeVisible();
  await expect(page.getByTestId("points-balance")).toHaveText("100");
});

test("an unconfirmed account cannot sign in", async ({ page }) => {
  const user = newUser("unconfirmed");
  await gotoHydrated(page, "/signup");
  await page.getByLabel("First name").fill(user.firstName);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  await gotoHydrated(page, "/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/confirm your email/i);
});

test("signup validates on the server and keeps entered values", async ({ page }) => {
  await gotoHydrated(page, "/signup");
  await page.getByLabel("First name").fill("Asha");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByLabel("First name")).toHaveValue("Asha");
});

test("sign out, wrong password, then sign in again", async ({ page }) => {
  const user = await signUpAndConfirm(page);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await gotoHydrated(page, "/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("WrongPassword1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Incorrect email or password.",
  );

  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  expect(await pointsBalance(page)).toBe(100);
});

test("protected pages redirect to login and come back after", async ({ page }) => {
  const user = await signUpAndConfirm(page);
  await page.context().clearCookies();

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/account");
  await expect(page.getByRole("heading", { name: /hi, test/i })).toBeVisible();
});

test("login ignores off-site `next` redirects", async ({ page }) => {
  const user = await signUpAndConfirm(page);
  await page.context().clearCookies();

  await gotoHydrated(page, "/login?next=//evil.example.com");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("http://127.0.0.1:3000/");
});

test("password reset via emailed link", async ({ page }) => {
  const user = await signUpAndConfirm(page);
  await page.context().clearCookies();

  await gotoHydrated(page, "/forgot-password");
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(/if an account exists/i);

  // The newest email is now the recovery one.
  await expect
    .poll(async () => (await latestAuthLink(page, user.email)).includes("type=recovery"))
    .toBe(true);
  await page.goto(await latestAuthLink(page, user.email));
  await page.waitForURL("/reset-password");
  await page.getByLabel("New password").fill("NewPassword456");
  await page.getByLabel("Confirm password").fill("NewPassword456");
  await page.getByRole("button", { name: "Update password" }).click();
  await page.waitForURL("/account?password=updated");
  await expect(page.getByText("Your password has been updated.")).toBeVisible();
});
