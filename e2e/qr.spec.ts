import { expect, test } from "@playwright/test";

import { gotoHydrated, OWNER, signIn, signUpAndConfirm } from "./helpers";

test.beforeEach(() => {
  test.slow();
});

test("member QR identifies the customer at the counter; tampered codes are rejected", async ({
  page,
  browser,
}) => {
  await signUpAndConfirm(page);
  await gotoHydrated(page, "/account");
  const qr = page.getByTestId("member-qr");
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
  const token = (await qr.getAttribute("data-token")) ?? "";
  expect(token).toMatch(/^LQ1\.[A-Z0-9]+\.\d+\.[A-Za-z0-9_-]{16}$/);

  const staff = await (await browser.newContext()).newPage();
  await signIn(staff, OWNER.email, OWNER.password);
  await gotoHydrated(staff, "/staff/award");

  // A scanner (or the camera dialog) delivers the raw token into the field.
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  await staff.getByLabel("Member code").fill(tampered);
  await staff.getByRole("button", { name: "Find member" }).click();
  await expect(staff.getByRole("main").getByRole("alert")).toContainText(
    "That QR code isn't valid.",
  );

  await staff.getByLabel("Member code").fill(token);
  await staff.getByRole("button", { name: "Find member" }).click();
  await expect(staff.getByTestId("member-found")).toContainText("Test");
  await staff.getByLabel("Bill amount (₹)").fill("250");
  await staff.getByRole("button", { name: "Award points" }).click();
  await expect(staff.getByRole("status")).toContainText("25 pts awarded to Test");
  await staff.context().close();
});
