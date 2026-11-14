-- merchant_analytics: access control, and numbers that reconcile with the ledger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temp table ctx (k text primary key, v jsonb) on commit drop;
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
create function pg_temp.snapshot(p_key text) returns void language plpgsql as $$
begin
  perform pg_temp.act_as('c0000000-0000-4000-8000-000000000002');  -- seeded owner
  insert into pg_temp.ctx values (p_key, public.merchant_analytics(30));
  perform pg_temp.reset();
end $$;
create function pg_temp.num(p_key text, variadic p_path text[]) returns bigint language sql as $$
  select (v #>> p_path)::bigint from pg_temp.ctx where k = p_key;
$$;

-- ------------------------------------------------------------- access ---
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');  -- customer
select throws_ok('select public.merchant_analytics(30)', '42501', 'forbidden',
  'customers cannot read merchant analytics');
select pg_temp.reset();
select pg_temp.act_as('c0000000-0000-4000-8000-000000000003');  -- cashier
select throws_ok('select public.merchant_analytics(30)', '42501', 'forbidden',
  'cashiers cannot read merchant analytics');
select pg_temp.reset();

select pg_temp.snapshot('before');
select ok((select v from ctx where k = 'before') ? 'liability', 'owner gets the analytics document');

-- ------------------------------------------------------------ fixture ---
-- A new member orders ₹1,200 using 40 points, then the order is fulfilled (+119).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000b1',
  'authenticated', 'authenticated', 'analytics@test.local', '', now(), '{}', '{}', now(), now());
insert into public.cart_items (merchant_id, account_id, product_id, qty)
select p.merchant_id, a.id, p.id, 1
from public.products p, public.loyalty_accounts a
where p.sku = 'LGC-002' and a.user_id = 'aaaaaaaa-0000-4000-8000-0000000000b1';
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000b1');
create temp table o as
  select public.place_order(gen_random_uuid(),
    (select id from public.stores where name = 'Indiranagar'), null, 40) as id;
grant select on o to public;
select pg_temp.reset();
select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.fulfill_order((select id from o));
select pg_temp.reset();

select pg_temp.snapshot('after');

-- --------------------------------------------------------- reconcile ---
select is(pg_temp.num('after', 'members', 'total') - pg_temp.num('before', 'members', 'total'), 1::bigint,
  'one new member counted');
select is(pg_temp.num('after', 'orders', 'fulfilled') - pg_temp.num('before', 'orders', 'fulfilled'), 1::bigint,
  'one more completed order');
select is(pg_temp.num('after', 'orders', 'revenue_paise') - pg_temp.num('before', 'orders', 'revenue_paise'),
  119000::bigint, 'revenue counts what the customer paid (₹1,200 − ₹10 in points)');
select is(pg_temp.num('after', 'points', 'issued') - pg_temp.num('before', 'points', 'issued'),
  219::bigint, 'issued = 100 signup + 119 earned on the ₹1,190 paid');
select is(pg_temp.num('after', 'points', 'redeemed') - pg_temp.num('before', 'points', 'redeemed'),
  40::bigint, 'redeemed counts the 40 points used at checkout');
select is(pg_temp.num('after', 'liability', 'points'),
  (select coalesce(sum(l.remaining), 0)::bigint from public.point_lots l
     where l.remaining > 0 and (l.expires_at is null or l.expires_at > now())),
  'liability equals the spendable points across all members');
select is(pg_temp.num('after', 'liability', 'paise'), pg_temp.num('after', 'liability', 'points') * 25,
  'liability in rupees uses the merchant point value');
select is(pg_temp.num('after', 'repeat', 'buyers') - pg_temp.num('before', 'repeat', 'buyers'), 1::bigint,
  'the new member counts as a buyer (not yet a repeat buyer)');

-- ------------------------------------------------------- series/clamp ---
select is((select jsonb_array_length(v -> 'daily') from ctx where k = 'after'), 30,
  'daily series has one point per day in the window');
select pg_temp.act_as('c0000000-0000-4000-8000-000000000002');
select is((public.merchant_analytics(5000) ->> 'days')::int, 365,
  'window is clamped to a year');
select pg_temp.reset();

select * from finish();
rollback;
