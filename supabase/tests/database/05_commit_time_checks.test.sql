-- Deferred constraint triggers run at COMMIT as the *session* role, not inside the
-- SECURITY DEFINER function that wrote the rows. Every other test file ends in
-- ROLLBACK, where deferred triggers never fire, so this file forces them with
-- SET CONSTRAINTS ALL IMMEDIATE under each real caller role.
-- Regression for: signup failing with "permission denied for table ledger_entries".
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to public;

-- ------------------------------------------------- signup (Supabase Auth) ---
-- GoTrue inserts into auth.users as supabase_auth_admin, which has no ledger
-- privileges. Insert as postgres (the zero-sum check stays deferred), then switch
-- to a role without ledger privileges before the check fires, as at a real COMMIT.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1',
  'authenticated', 'authenticated', 'commit-check@test.local', '', now(),
  '{"provider":"email"}', '{"first_name":"Commit"}', now(), now());
-- As the new user, RLS hides the system-account leg: an invoker-rights check would
-- see only +100 and report a false imbalance (or, as supabase_auth_admin, be denied).
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select lives_ok('set constraints all immediate',
  'signup bonus passes the zero-sum check under an unprivileged session role');
select set_config('request.jwt.claims', '', true);
set constraints all deferred;
reset role;

select is(
  (select b.balance from public.point_balances b
     join public.loyalty_accounts a on a.id = b.loyalty_account_id
    where a.user_id = 'aaaaaaaa-0000-4000-8000-0000000000c1'),
  100::bigint, 'signup bonus posted');

-- ------------------------------------------------- customer RPCs (PostgREST) ---
insert into ctx select 'acct', id from public.loyalty_accounts
  where user_id = 'aaaaaaaa-0000-4000-8000-0000000000c1';
insert into ctx select 'store', id from public.stores where name = 'Indiranagar';
insert into public.cart_items (merchant_id, account_id, product_id, qty)
select p.merchant_id, (select v from ctx where k = 'acct'), p.id, 1
from public.products p where p.sku = 'LGC-002';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1","role":"authenticated"}', true);

select lives_ok(
  format($$ select public.place_order(gen_random_uuid(), %L, null, 40) $$,
         (select v from ctx where k = 'store')),
  'place_order with points as authenticated');
select lives_ok('set constraints all immediate',
  'checkout redemption passes the zero-sum check as authenticated');
set constraints all deferred;

select set_config('role', 'none', true);
select set_config('request.jwt.claims', '', true);
select is(
  (select b.balance from public.point_balances b
    where b.loyalty_account_id = (select v from ctx where k = 'acct')),
  60::bigint, 'balance reflects the committed-shape checkout');

select * from finish();
rollback;
