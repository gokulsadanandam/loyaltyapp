import { expect, type Page } from "@playwright/test";

const MAILPIT = "http://127.0.0.1:54324";

export interface TestUser {
  email: string;
  password: string;
  firstName: string;
}

export function newUser(prefix = "e2e"): TestUser {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return { email: `${prefix}-${id}@example.com`, password: "Password123", firstName: "Test" };
}

interface MailpitSearch {
  messages: { ID: string }[];
}
interface MailpitMessage {
  Text: string;
  HTML: string;
}

/** Polls Mailpit for the newest email to `email` and returns its Supabase verify link. */
export async function latestAuthLink(page: Page, email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await page.request.get(`${MAILPIT}/api/v1/search`, {
          params: { query: `to:"${email}"`, limit: "1" },
        });
        const { messages } = (await search.json()) as MailpitSearch;
        const id = messages[0]?.ID;
        if (!id) return undefined;
        const message = (await (
          await page.request.get(`${MAILPIT}/api/v1/message/${id}`)
        ).json()) as MailpitMessage;
        const match = /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>)]*/.exec(
          `${message.Text}\n${message.HTML}`,
        );
        link = match?.[0].replaceAll("&amp;", "&");
        return link;
      },
      { message: `confirmation email for ${email}`, timeout: 20_000 },
    )
    .toBeTruthy();
  if (!link) throw new Error("unreachable");
  return link;
}

/** Signs up through the UI and confirms via the emailed link. Ends signed in on `/`. */
export async function signUpAndConfirm(page: Page, user: TestUser = newUser()): Promise<TestUser> {
  await gotoHydrated(page, "/signup");
  await page.getByLabel("First name").fill(user.firstName);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // Same browser context: it holds the PKCE verifier cookie set during signup.
  await page.goto(await latestAuthLink(page, user.email));
  await page.waitForURL((url) => url.pathname === "/");
  return user;
}

/**
 * Prerendered pages are visible before React hydrates; a click in that window is
 * dropped. Wait for the network to settle (scripts loaded, hydration done).
 */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

export async function pointsBalance(page: Page): Promise<number> {
  const text = await page.getByTestId("points-balance").innerText();
  return Number(text.replace(/[^0-9]/g, ""));
}
