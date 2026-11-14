-- Spendable vs. booked points, the expiry sweep, and its schedule.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to public;

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Two users via the real signup trigger (100-point bonus lot, 365-day expiry).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e1',
   'authenticated', 'authenticated', 'expiry1@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e2',
   'authenticated', 'authenticated', 'expiry2@test.local', '', now(), '{}', '{}', now(), now());
insert into ctx select 'acct', id from public.loyalty_accounts
  where user_id = 'aaaaaaaa-0000-4000-8000-0000000000e1';

-- ------------------------------------------------------------ summary ---
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e1');
select results_eq(
  'select balance, available, expiring_30d from public.my_points_summary()',
  'values (100::bigint, 100::bigint, 0::bigint)',
  'fresh signup: everything spendable, nothing expiring soon');
select pg_temp.reset();

-- Lot due in 10 days -> "expiring soon".
update public.point_lots set expires_at = now() + interval '10 days'
  where loyalty_account_id = (select v from ctx where k = 'acct');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e1');
select is((select expiring_30d from public.my_points_summary()), 100::bigint,
  'points due within 30 days are reported as expiring');
select pg_temp.reset();

-- Lot past expiry but not yet swept.
update public.point_lots set expires_at = now() - interval '1 minute'
  where loyalty_account_id = (select v from ctx where k = 'acct');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e1');
select results_eq(
  'select balance, available from public.my_points_summary()',
  'values (100::bigint, 0::bigint)',
  'expired-but-unswept points are booked but not spendable');
select is((select count(*)::int from public.my_points_summary()), 1,
  'summary returns only the caller''s own account');

insert into public.cart_items (merchant_id, account_id, product_id, qty)
select p.merchant_id, (select v from ctx where k = 'acct'), p.id, 1
from public.products p where p.sku = 'LGC-002';
select throws_ok(
  $$ select public.place_order(gen_random_uuid(),
       (select id from public.stores where name = 'Indiranagar'), null, 10) $$,
  'P0001', 'insufficient_points', 'checkout agrees: expired points cannot be redeemed');
select pg_temp.reset();

-- Another user sees only their own summary.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e2');
select results_eq('select balance, available from public.my_points_summary()',
  'values (100::bigint, 100::bigint)', 'second user sees only their own points');
select pg_temp.reset();

-- --------------------------------------------------------------- sweep ---
select ok(private.expire_points() >= 1, 'expire_points sweeps the expired lot');
select is(
  (select balance from public.point_balances
    where loyalty_account_id = (select v from ctx where k = 'acct')),
  0::bigint, 'balance drops to zero after the sweep');
select is(
  (select count(*)::int from public.ledger_transactions t
     join public.point_lots l on t.ref_id = l.id
    where t.kind = 'expire' and l.loyalty_account_id = (select v from ctx where k = 'acct')),
  1, 'one expire transaction posted');
select is(private.expire_points(), 0, 'a second sweep finds nothing (idempotent)');
select is(
  (select coalesce(sum(e.amount), 0)::bigint from public.ledger_entries e
     join public.ledger_transactions t on t.id = e.txn_id where t.kind = 'expire'),
  0::bigint, 'expire transactions balance to zero');

-- ------------------------------------------------------------ schedule ---
select is(
  (select count(*)::int from cron.job
    where jobname = 'expire-points-nightly' and command like '%private.expire_points()%'),
  1, 'nightly expiry job is scheduled');

select * from finish();
rollback;
