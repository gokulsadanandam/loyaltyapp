-- Idempotency: replaying any RPC with the same key has exactly one effect.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

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

create function tests.act_as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
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
  ('cashier', tests.create_user('cashier@test.local')),
  ('owner', tests.create_user('owner@test.local'));
insert into ctx select 'alice_acct', id from public.loyalty_accounts where user_id = tests.ctx('alice');
insert into ctx select 'bag1', id from public.products where sku = 'LGC-001';
insert into ctx select 'bag2', id from public.products where sku = 'LGC-002';
insert into ctx select 'store', id from public.stores where name = 'Indiranagar';
insert into ctx select 'gift', id from public.rewards where name = 'Free gift wrap';
insert into ctx select 'voucher', id from public.rewards where name = '₹100 off voucher';
insert into public.merchant_staff (merchant_id, user_id, role) values
  (tests.ctx('merchant'), tests.ctx('cashier'), 'cashier'),
  (tests.ctx('merchant'), tests.ctx('owner'), 'owner');

-- ----------------------------------------------------------- place_order ---
select tests.act_as(tests.ctx('alice'));
insert into public.cart_items (merchant_id, account_id, product_id, qty)
values (tests.ctx('merchant'), tests.ctx('alice_acct'), tests.ctx('bag1'), 1);
insert into ctx select 'order1',
  public.place_order('dddddddd-0000-4000-8000-000000000001'::uuid, tests.ctx('store'), null, 20);

select is(
  public.place_order('dddddddd-0000-4000-8000-000000000001'::uuid, tests.ctx('store'), null, 20),
  tests.ctx('order1'), 'place_order replay returns the original order');
select is((select count(*)::int from public.orders), 1, 'replay created no second order');
select is((select balance from public.point_balances), 80::bigint, 'points deducted exactly once');
select is((select count(*)::int from public.ledger_transactions where kind = 'redeem'), 1,
  'exactly one redeem transaction');

insert into public.cart_items (merchant_id, account_id, product_id, qty)
values (tests.ctx('merchant'), tests.ctx('alice_acct'), tests.ctx('bag2'), 1);
select is(
  public.place_order('dddddddd-0000-4000-8000-000000000001'::uuid, tests.ctx('store'), null, 20),
  tests.ctx('order1'), 'replay after refilling the cart still returns the original order');
select is((select count(*)::int from public.cart_items), 1, '... and leaves the new cart untouched');
select isnt(
  public.place_order('dddddddd-0000-4000-8000-000000000002'::uuid, tests.ctx('store')),
  tests.ctx('order1'), 'a new key creates a new order');

-- --------------------------------------------------------- fulfill_order ---
-- order1 total = ₹1,200 - 20 pts x ₹0.25 = ₹1,195 -> 119 points
select tests.act_as_service();
insert into ctx select 'earn1', public.fulfill_order(tests.ctx('order1'), 'pay_idem_1');

select is(public.fulfill_order(tests.ctx('order1'), 'pay_idem_1'), tests.ctx('earn1'),
  'fulfill_order replay returns the original earn transaction');
select is(
  (select count(*)::int from public.ledger_transactions
    where idempotency_key = 'order:' || tests.ctx('order1') || ':earn'),
  1, 'points earned exactly once');
select throws_ok(
  format($$ select public.fulfill_order(%L, 'pay_other') $$, tests.ctx('order1')),
  'P0001', 'order_already_fulfilled', 'a different payment ref on a fulfilled order is rejected');

-- --------------------------------------------------------- redeem_reward ---
-- balance: 80 + 119 = 199
select tests.act_as(tests.ctx('alice'));
insert into ctx select 'redemption1',
  public.redeem_reward(tests.ctx('gift'), 'eeeeeeee-0000-4000-8000-000000000001'::uuid);

select is(public.redeem_reward(tests.ctx('gift'), 'eeeeeeee-0000-4000-8000-000000000001'::uuid),
  tests.ctx('redemption1'), 'redeem_reward replay returns the original redemption');
select is((select balance from public.point_balances), 49::bigint, 'reward cost deducted exactly once');
select is((select count(*)::int from public.reward_redemptions), 1, 'exactly one redemption row');
select is((select stock from public.rewards where id = tests.ctx('gift')), 99,
  'stock decremented exactly once');
select throws_ok(
  $$ select public.redeem_reward(tests.ctx('voucher'), 'eeeeeeee-0000-4000-8000-000000000001'::uuid) $$,
  'P0001', 'idempotency_key_reused', 'reusing a key for a different reward is rejected');

-- ---------------------------------------------------------- refund_order ---
-- +20 redeem_reversal -> 69 spendable; clawback min(119, 69) = 69; shortfall 50 -> balance 0
select tests.act_as_service();
select is(public.refund_order(tests.ctx('order1'), 'customer returned item'),
  'refunded'::public.order_status, 'refund moves a fulfilled order to refunded');
select is(public.refund_order(tests.ctx('order1'), 'customer returned item'),
  'refunded'::public.order_status, 'refund replay is a no-op');
select is(
  (select count(*)::int from public.ledger_transactions
    where ref_id = tests.ctx('order1') and kind in ('redeem_reversal', 'earn_reversal')),
  2, 'each reversal posted exactly once');
select is(
  (select (metadata ->> 'shortfall')::int from public.ledger_transactions
    where idempotency_key = 'order:' || tests.ctx('order1') || ':earn_reversal'),
  50, 'clawback is capped at spendable points; shortfall recorded');

-- ---------------------------------------------------- staff_award_points ---
select tests.act_as(tests.ctx('cashier'));
insert into ctx select 'award1', public.staff_award_points(
  (select member_code from public.profiles where id = tests.ctx('alice')),
  50000, 'ffffffff-0000-4000-8000-000000000001'::uuid);

select is(
  public.staff_award_points(
    (select member_code from public.profiles where id = tests.ctx('alice')),
    50000, 'ffffffff-0000-4000-8000-000000000001'::uuid),
  tests.ctx('award1'), 'staff_award_points replay returns the original transaction');
select is(
  (select balance from public.point_balances where loyalty_account_id = tests.ctx('alice_acct')),
  50::bigint, '₹500 in store earned 50 points exactly once');

-- ---------------------------------------------------------- admin_adjust ---
select tests.act_as(tests.ctx('owner'));
insert into ctx select 'adjust1', public.admin_adjust(
  tests.ctx('alice_acct'), 10, 'goodwill credit', '99999999-0000-4000-8000-000000000001'::uuid);

select is(
  public.admin_adjust(tests.ctx('alice_acct'), 10, 'goodwill credit',
    '99999999-0000-4000-8000-000000000001'::uuid),
  tests.ctx('adjust1'), 'admin_adjust replay returns the original transaction');
select is(
  (select balance from public.point_balances where loyalty_account_id = tests.ctx('alice_acct')),
  60::bigint, 'adjustment applied exactly once');

select tests.reset();
select * from finish();
rollback;
