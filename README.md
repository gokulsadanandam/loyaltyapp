# loyalty-web

Rebuild of the legacy `loyaltyapp/` (Express + AngularJS + MongoDB) on Next.js App Router,
TypeScript (strict), Tailwind + shadcn/ui, and Supabase.

**Phase 1 (this commit): database foundation only.** No UI yet.

## Prerequisites

- Node 22+ (`.nvmrc`)
- Docker Desktop (required by `supabase start`; on Windows this needs WSL2)

## Local setup

```bash
npm install
npm run db:start          # boots local Supabase; prints URL + keys
cp .env.example .env.local  # paste the publishable + secret keys from `npx supabase status`
npm run db:reset          # migrations + seed.sql + storage objects
npm run db:test           # pgTAP suite (supabase/tests/database)
npm run db:types          # regenerate src/lib/database.types.ts
npm run dev
```

Seeded logins (local only): `customer@example.com` / `Password123`,
`admin@example.com` / `Password123` (merchant owner).

## Database layout

| Migration          | Contents                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `…0100_foundation` | PostGIS, `private` schema, enums, deny-by-default privileges                                                           |
| `…0200_core`       | merchants, profiles, merchant_staff, tiers, loyalty_accounts                                                           |
| `…0300_commerce`   | stores (PostGIS), products, rewards, cart_items, orders, order_items, reward_redemptions                               |
| `…0400_ledger`     | double-entry ledger, point lots, balances, invariant triggers, `post_points`                                           |
| `…0500_auth_rls`   | `handle_new_user`, access-token hook, RLS helpers + policies, grants                                                   |
| `…0600_storage`    | `avatars` + `product-images` buckets and object policies                                                               |
| `…0700_rpcs`       | `place_order`, `fulfill_order`, `refund_order`, `redeem_reward`, `staff_award_points`, `admin_adjust`, `nearby_stores` |
| `…0800_audit`      | audit_log + triggers                                                                                                   |

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
