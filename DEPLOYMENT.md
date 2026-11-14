# Deployment

Production runs on **Vercel** (the Next.js app) and **Supabase Cloud** (Postgres, Auth,
Storage, pg_cron). GitHub Actions is the only path to production. On every push to
`master` it:

1. runs typecheck, lint and unit tests; migrations with pgTAP and the schema linter;
   and the Playwright end-to-end suite against a local Supabase stack;
2. if all of that passes, applies new database migrations (`supabase db push`);
3. then builds and deploys the app to Vercel.

Pull requests run step 1 only. Until the secrets below exist, the deploy job reports
"Deploy skipped" and stays green.

`.github/workflows/notifications.yml` sends queued notification emails every 10 minutes.

---

## One-time setup

Do these in order. Steps 1–5 take about 30 minutes; nothing deploys until step 5.

### 1. Supabase project

1. Create a project at supabase.com. Region **Mumbai (ap-south-1)** keeps latency low for
   Indian customers. Save the **database password**.
2. Note the **project ref**, the `xxxx` in `https://xxxx.supabase.co`.
3. Under **Project Settings → API keys**, copy the **publishable** key and a **secret** key.
4. Create a personal **access token** at supabase.com/dashboard/account/tokens. CI uses it
   to run migrations.

### 2. Supabase Auth settings (dashboard)

`supabase/config.toml` only configures the local stack. Set these in production:

| Setting                                            | Value                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication → URL Configuration → Site URL      | `https://<your-domain>`                                                                                                                     |
| … → Redirect URLs                                  | `https://<your-domain>/**`                                                                                                                  |
| Authentication → Providers → Email → Confirm email | On                                                                                                                                          |
| … → Minimum password length / requirements         | 8, letters and digits (the app validates the same)                                                                                          |
| Authentication → Hooks → Customize Access Token    | Postgres function `public.custom_access_token_hook`                                                                                         |
| Authentication → Emails → SMTP Settings            | Your provider (for example Resend SMTP). Supabase's built-in sender is rate-limited to a few emails per hour, so signups stall without this |

### 3. Vercel project

1. Create a project for this repository, but don't let Vercel deploy on Git pushes.
   `vercel.json` already sets `git.deploymentEnabled: false`, so only CI deploys, and
   only after the tests pass.
2. Note the **Org ID** and **Project ID** (Project → Settings → General), and create a
   **token** (Account → Tokens).
3. Add **Environment Variables** for **Production**:

| Variable                               | Value                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<ref>.supabase.co`                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key                                                                           |
| `NEXT_PUBLIC_SITE_URL`                 | `https://<your-domain>` (must match the Supabase Site URL)                                |
| `SUPABASE_SECRET_KEY`                  | secret key. Server only; used only by the email delivery route                            |
| `CRON_SECRET`                          | 24+ random characters (`openssl rand -hex 24`)                                            |
| `EMAIL_FROM`                           | for example `Your Shop <hello@yourshop.com>` (a domain verified with your email provider) |
| `QR_HMAC_SECRET`                       | 32+ random characters (`openssl rand -base64 32`); signs member QR codes                  |
| `RESEND_API_KEY`                       | Resend API key, for notification emails                                                   |

### 4. GitHub secrets and variables

Repository → Settings → Environments → create **`production`**. Optionally add required
reviewers so each deploy waits for a click. Then add:

| Kind     | Name                    | Value                                       |
| -------- | ----------------------- | ------------------------------------------- |
| Secret   | `SUPABASE_ACCESS_TOKEN` | from step 1.4                               |
| Secret   | `SUPABASE_DB_PASSWORD`  | from step 1.1                               |
| Secret   | `SUPABASE_PROJECT_REF`  | from step 1.2                               |
| Secret   | `VERCEL_TOKEN`          | from step 3.2                               |
| Secret   | `VERCEL_ORG_ID`         | from step 3.2                               |
| Secret   | `VERCEL_PROJECT_ID`     | from step 3.2                               |
| Secret   | `CRON_SECRET`           | the same value as in Vercel                 |
| Variable | `PRODUCTION_URL`        | `https://<your-domain>` (no trailing slash) |

### 5. First deploy

Push to `master`, or re-run the latest "CI / Deploy" workflow. The deploy job applies all
migrations to the empty database, then deploys the app.

### 6. Load the catalog (once)

Production never runs the dev seed: `supabase/seed/02_dev_users.sql` contains test accounts
with known passwords. Load only the catalog: the default merchant, tiers, stores, the 19
legacy products and the starter rewards. It refuses to run twice.

```bash
# Connection string: Supabase dashboard → Connect → Session pooler (URI)
psql "$DATABASE_URL" -f supabase/seed/01_catalog.sql

# Product images, into the merchant's folder in the product-images bucket
npx supabase link --project-ref <ref>
npx supabase storage cp -r --experimental --remote \
  supabase/storage/product-images/b0000000-0000-4000-8000-000000000001 \
  ss:///product-images/b0000000-0000-4000-8000-000000000001
```

Review the prices flagged in `supabase/storage/README.md` before launch, and fix them in
`/staff/catalog`.

### 7. First owner

Sign up on the live site with your own email and confirm it. Then run:

```bash
psql "$DATABASE_URL" -v email='you@yourshop.com' -f supabase/bootstrap/grant-owner.sql
```

You now have `/staff`. Add other staff from there, or with SQL as an owner.

---

## Day to day

- **Ship:** merge a pull request into `master`. CI tests, migrates and deploys.
- **Database changes:** add a new file in `supabase/migrations/`. Never edit one that has
  already been applied. Keep migrations backward-compatible (add, then switch, then remove
  in a later release), because migrations apply a minute or two before the new app is live.
- **Roll back the app:** Vercel → Deployments → previous deployment → Promote. Database
  migrations go forward only; fix with a new migration.
- **Watch:** GitHub Actions for deploys; Supabase → Logs for database and auth; Vercel →
  Logs for the app. Notification delivery failures are recorded per row in
  `notifications.email_status` / `email_error`.
