import { chromium, type FullConfig } from "@playwright/test";

/**
 * Warms a freshly started server before the suite runs. A cold `next start` has an
 * empty image-optimisation cache, so the first page views queue dozens of sharp
 * encodes (seconds each), and everything else on the server waits behind them.
 * Tests assert behaviour, not cold-start latency, so pay that cost once up front:
 * load the home page and every product page, filling the image and data caches.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://127.0.0.1:3000";
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const hrefs = await page
      .locator('a[href^="/products/"]')
      .evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute("href") ?? ""))]);
    for (const href of hrefs) {
      await page.goto(href);
      await page.waitForLoadState("networkidle");
    }
    for (const path of ["/rewards", "/login", "/signup"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
  } finally {
    await browser.close();
  }
}
