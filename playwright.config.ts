import { defineConfig, devices } from "@playwright/test";

// Test helpers talk to Supabase directly, so they need the same public env as the app.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the variables directly.
}

/**
 * End-to-end tests against a production build and the local Supabase stack.
 * Prerequisites: `npm run db:start` (Mailpit receives the confirmation emails).
 * Run with `npm run test:e2e`, which builds first.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // Must match NEXT_PUBLIC_SITE_URL so auth cookies and email redirects line up.
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next start -H 127.0.0.1 -p 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
