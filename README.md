# loyalty-web

Rebuild of the legacy `loyaltyapp/` (Express + AngularJS + MongoDB) on Next.js App Router,
TypeScript (strict), Tailwind + shadcn/ui, and Supabase.

- **Phase 1:** database foundation (schema, ledger, RLS, RPCs, pgTAP).
- **Phase 2:** customer app. Auth with email verification, catalog, cart, checkout with
  points, rewards, and account.
- **Phase 3 (in progress):** points history, spendable points and nightly expiry, a staff
  console (order fulfilment and refunds, in-store awards, catalog and rewards editor),
  referral rewards, and member notifications (tier-up and points expiry). Razorpay is next.

## Prerequisites

- Node 22+ (`.nvmrc`)
- Docker Desktop (required by `supabase start`; on Windows this needs WSL2)

## Local setup

```bash
npm install
npm run db:start          # boots local Supabase; prints URL + keys
cp .env.example .env.local  # paste the publishable key from `npx supabase status`
npm run db:reset          # migrations + seed.sql + storage objects
npm run db:test           # pgTAP suite (supabase/tests/database)
npm run db:types          # regenerate src/lib/database.types.ts
npm run dev               # http://127.0.0.1:3000 (use 127.0.0.1, not localhost: see below)
```

Confirmation and password-reset emails go to Mailpit at http://127.0.0.1:54324.
After changing `supabase/config.toml`, restart with `npm run db:stop && npm run db:start`.

Seeded logins (local only): `customer@example.com` / `Password123`,
`admin@example.com` / `Password123` (merchant owner, full staff console),
`cashier@example.com` / `Password123` (cashier: orders and in-store awards only).

## Database layout

| Migration                             | Contents                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `…0100_foundation`                    | PostGIS, `private` schema, enums, deny-by-default privileges                                                           |
| `…0200_core`                          | merchants, profiles, merchant_staff, tiers, loyalty_accounts                                                           |
| `…0300_commerce`                      | stores (PostGIS), products, rewards, cart_items, orders, order_items, reward_redemptions                               |
| `…0400_ledger`                        | double-entry ledger, point lots, balances, invariant triggers, `post_points`                                           |
| `…0500_auth_rls`                      | `handle_new_user`, access-token hook, RLS helpers + policies, grants                                                   |
| `…0600_storage`                       | `avatars` + `product-images` buckets and object policies                                                               |
| `…0700_rpcs`                          | `place_order`, `fulfill_order`, `refund_order`, `redeem_reward`, `staff_award_points`, `admin_adjust`, `nearby_stores` |
| `…0800_audit`                         | audit_log + triggers                                                                                                   |
| `…0900_ledger_commit_check_rights`    | Fix: the deferred zero-sum check runs with owner rights (see below)                                                    |
| `…1000_points_summary_and_expiry_job` | `my_points_summary()`; pg_cron runs `expire_points()` nightly (03:00 IST)                                              |
| `…1100_referral_rewards`              | Referral settings on `merchants`, award trigger on order fulfilment, `my_referrals()`                                  |
| `…1200_notifications`                 | Notifications feed + email outbox, tier-up/expiry triggers, nightly expiry reminders                                   |

### Rules the database enforces

- Points move only through `private.post_points`; clients have no write grant on any ledger,
  balance, lot, order, or redemption table.
- Every ledger transaction sums to zero (deferred constraint trigger); history is append-only.
- `point_balances.balance >= 0` is a CHECK constraint, independent of RPC logic.
- Every mutating RPC takes the customer's `point_balances` row lock first, then checks its
  idempotency key, so retries and concurrent requests are applied at most once.
- Prices are always read from `products`; the client sends only IDs, quantities, and keys.

### RPC error contract

Errors surface as `{ code, message }` from PostgREST. `message` is a stable identifier:
`not_authenticated` (28000), `forbidden` (42501), and P0001 business errors such as
`cart_empty`, `insufficient_points`, `redeem_limit_exceeded`, `reward_out_of_stock`,
`idempotency_key_reused`, `order_already_fulfilled`.

## Scripts

| Script            | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `npm run check`   | typecheck + lint + prettier check                       |
| `npm run db:lint` | `supabase db lint` (plpgsql_check) against the local DB |

## Testing

| Command            | What runs                                                                          |
| ------------------ | ---------------------------------------------------------------------------------- |
| `npm test`         | Vitest unit tests: points maths (mirrors the SQL), redirects, error mapping, forms |
| `npm run db:test`  | pgTAP: RLS, write protection, ledger invariants, idempotency, commit-time checks   |
| `npm run test:e2e` | Builds, then Playwright against `next start` + local Supabase (needs `db:start`)   |

The end-to-end suite creates a fresh user per test through the real signup and Mailpit
confirmation flow, so it doesn't depend on seed state and can run in parallel.
`e2e/global-setup.ts` warms the image cache first; a cold `next start` spends seconds
per product image in sharp.

**Why `05_commit_time_checks` exists.** The ledger's zero-sum check is a deferred
constraint trigger, so it runs at COMMIT as the session role (`authenticated`,
`supabase_auth_admin`), not inside the SECURITY DEFINER RPC. pgTAP files end in
ROLLBACK, where deferred triggers never fire, so tests 01–04 passed while every real
points transaction failed at commit. Test 05 forces those checks under the real roles,
and migration 0900 fixes the bug.

## App architecture (Phase 2)

- **Data access** lives in `src/lib/data/*` and `src/lib/auth.ts`. Components don't call
  `supabase.from()` directly. Server reads run as the user, so RLS applies, and no
  function takes a user id from the caller.
- **Three Supabase clients:**
  - `supabase/server.ts`: cookie-bound, for per-request reads and actions;
  - `supabase/client.ts`: browser, used for the cart;
  - `supabase/public.ts`: cookie-less, for the cached public catalog.
- **Cache Components** is enabled. The catalog uses `'use cache'` and prerenders into the
  static shell. Anything that reads the session sits behind `<Suspense>` and streams in.
- **Mutations:**
  - checkout and redemption are Server Actions. They validate with Zod, send only ids,
    point counts and an idempotency key, and the RPCs enforce prices and limits;
  - the cart uses TanStack Query with optimistic updates, over RLS-protected `cart_items`.
- **Auth:** `proxy.ts` refreshes the session and redirects early, but every page and
  action re-checks through `getClaims()`. Email links are built from
  `NEXT_PUBLIC_SITE_URL`, never the Host header. `next` parameters go through
  `safeNextPath`. Sign-out does a full page load, so no per-user client state survives.
- **Use `127.0.0.1:3000`.** Supabase's `site_url` and the PKCE cookie are tied to that
  origin; mixing in `localhost` breaks email-link sign-in.

## Staff console (`/staff`)

| Area               | Who          | Notes                                                                                                                                 |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Orders             | all staff    | Mark collected and paid (posts earned points); owner/admin can cancel or refund with a reason                                         |
| Award              | all staff    | In-store purchases by member code; idempotent; you can't award yourself                                                               |
| Catalog, Rewards   | owner, admin | Products are hidden rather than deleted, so order history stays intact. Images upload straight to Storage under the merchant's folder |
| Referral programme | owner        | Points for each side and the minimum first order                                                                                      |

Non-staff get a 404. Every write is re-checked in the database (RLS or the RPC's role check).

## Referral rules

- A member signs up with a friend's code (`/signup?ref=CODE`).
- When the new member's **first order at or above the minimum** is completed, both people
  earn the configured points (defaults: referrer 200, new member 100, ₹500 minimum).
- This happens once per new member, ever, inside the fulfilment transaction.
- A later refund doesn't take the bonus back. Revisit this if abuse appears.
- `my_referrals()` returns counts only. Referrers never see who signed up.

## Notifications

| Event           | When                                                                               | Deduplicated by                                  |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| Tier up         | `tier_id` moves to a higher tier (never on a downgrade, never for the signup tier) | account and tier, so each tier is announced once |
| Points expiring | Nightly 02:30 IST: lots expiring within 7 days                                     | account and earliest expiry date                 |
| Points expired  | The 03:00 IST sweep; several lots fold into one message                            | account and IST day                              |

Members see a bell with an unread count and a feed at `/notifications`, and can turn
email off there. Writes come only from database functions. Members can read the message
and set `read_at`, nothing else.

**Email delivery** uses an outbox: rows start as `pending` (or `skipped` if the member
opted out). `/api/notifications/deliver` claims a batch with `FOR UPDATE SKIP LOCKED`,
sends, and records `sent`; failures retry up to 3 times, then stay `failed`.

- **Auth:** `Authorization: Bearer $CRON_SECRET`, compared in constant time.
- **Schedule:** `vercel.json` runs it every 10 minutes on Vercel Cron.
- **Transport:** Resend when `RESEND_API_KEY` is set. Locally it uses Mailpit's HTTP API
  (`MAILPIT_URL`), so emails show up at http://127.0.0.1:54324.
- **Run it by hand:**
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/notifications/deliver`

This route is the only place the service-role key (`SUPABASE_SECRET_KEY`) is used.
