-- Cross-user RLS isolation on ledger, orders, balances, lots, accounts, profiles, carts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------------------------------------------------------------- helpers ---
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to public;

create function tests.ctx(p_key text) returns uuid language sql stable
as $$ select c.v from pg_temp.ctx c where c.k = p_key $$;

create function tests.create_user(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, '', now(), '{"provider":"email"}'::jsonb,
    jsonb_build_object('first_name', split_part(p_email, '@', 1)), now(), now());
  return v_id;
end $$;

create function tests.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function tests.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

create function tests.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- --------------------------------------------------------------- fixtures ---
insert into ctx values
  ('merchant', 'b0000000-0000-4000-8000-000000000001'),
  ('alice', tests.create_user('alice@test.local')),
  ('bob', tests.create_user('bob@test.local'));
insert into ctx select 'alice_acct', id from public.loyalty_accounts where user_id = tests.ctx('alice');
insert into ctx select 'product', id from public.products where sku = 'LGC-001';
insert into ctx select 'store', id from public.stores where name = 'Indiranagar';

-- Alice checks out, redeeming 40 of her 100 signup points.
select tests.act_as(tests.ctx('alice'));
insert into public.cart_items (merchant_id, account_id, product_id, qty)
values (tests.ctx('merchant'), tests.ctx('alice_acct'), tests.ctx('product'), 1);

select lives_ok(
  $$ select public.place_order('aaaaaaaa-0000-4000-8000-000000000001'::uuid, tests.ctx('store'), null, 40) $$,
  'alice can place an order redeeming 40 points');

-- ------------------------------------------------------------ bob's view ---
select tests.act_as(tests.ctx('bob'));

select is((select count(*)::int from public.orders), 0, 'bob sees no orders');
select is((select count(*)::int from public.order_items), 0, 'bob sees no order items');
select is((select count(*)::int from public.ledger_entries), 1,
  'bob sees only his own signup leg (not alice''s, not the system counter-leg)');
select is((select count(*)::int from public.ledger_transactions), 1,
  'bob sees only his own transaction');
select is((select count(*)::int from public.point_balances), 1, 'bob sees exactly one balance');
select is((select balance from public.point_balances), 100::bigint,
  'that balance is his own 100-point signup bonus');
select is((select count(*)::int from public.point_lots), 1, 'bob sees only his own lot');
select is((select count(*)::int from public.loyalty_accounts), 1,
  'bob sees only his own loyalty account');
select is_empty(
  $$ select 1 from public.profiles where id = tests.ctx('alice') $$,
  'bob cannot read alice''s profile');
select throws_ok(
  $$ insert into public.cart_items (merchant_id, account_id, product_id, qty)
     values (tests.ctx('merchant'), tests.ctx('alice_acct'), tests.ctx('product'), 1) $$,
  '42501', 'new row violates row-level security policy for table "cart_items"',
  'bob cannot write into alice''s cart');

-- Silently filtered by RLS (0 rows); verified below as postgres.
update public.profiles set first_name = 'hacked' where id = tests.ctx('alice');

-- ---------------------------------------------------------- alice's view ---
select tests.act_as(tests.ctx('alice'));

select is((select count(*)::int from public.orders), 1, 'alice sees her order');
select is((select count(*)::int from public.ledger_entries), 2,
  'alice sees her signup and redeem legs only');
select is((select balance from public.point_balances), 60::bigint,
  'alice''s balance reflects the redemption');

-- --------------------------------------------------------------- checks ---
select tests.reset();
select is((select first_name from public.profiles where id = tests.ctx('alice')), 'alice',
  'bob''s update did not touch alice''s profile');

select tests.act_as_anon();
select throws_ok(
  $$ select * from public.point_balances $$,
  '42501', 'permission denied for table point_balances',
  'anon cannot read balances at all');
select ok((select count(*) from public.products) > 0, 'anon can browse active products');

select tests.reset();
select * from finish();
rollback;
