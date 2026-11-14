-- Zero-sum, overdraft prevention (RPC layer AND raw table layer), balance/lot
-- reconciliation, append-only history.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

-- Raw ledger posting that bypasses every RPC guard (superuser only).
create function tests.raw_post(p_entries jsonb, p_key text, p_check_now boolean) returns void
language plpgsql as $$
declare
  v_txn uuid;
  e     jsonb;
begin
  insert into public.ledger_transactions (merchant_id, kind, idempotency_key)
  values ('b0000000-0000-4000-8000-000000000001', 'adjust', p_key)
  returning id into v_txn;
  for e in select * from jsonb_array_elements(p_entries) loop
    insert into public.ledger_entries (txn_id, ledger_account_id, amount)
    values (v_txn, (e ->> 'account')::uuid, (e ->> 'amount')::bigint);
  end loop;
  if p_check_now then
    set constraints all immediate;  -- force the deferred zero-sum check now
  end if;
end $$;

-- --------------------------------------------------------------- fixtures ---
insert into ctx values
  ('merchant', 'b0000000-0000-4000-8000-000000000001'),
  ('alice', tests.create_user('alice@test.local'));
insert into ctx select 'alice_acct', id from public.loyalty_accounts where user_id = tests.ctx('alice');
insert into ctx select 'alice_la', id from public.ledger_accounts where loyalty_account_id = tests.ctx('alice_acct');
insert into ctx select 'issued_la', id from public.ledger_accounts
  where merchant_id = tests.ctx('merchant') and kind = 'issued';
insert into ctx select 'adjustment_la', id from public.ledger_accounts
  where merchant_id = tests.ctx('merchant') and kind = 'adjustment';
insert into ctx select 'product', id from public.products where sku = 'LGC-001';
insert into ctx select 'store', id from public.stores where name = 'Indiranagar';
insert into ctx select 'gift', id from public.rewards where name = 'Free gift wrap';
insert into ctx select 'voucher', id from public.rewards where name = '₹100 off voucher';

-- ------------------------------------------------- realistic activity ---
select tests.act_as(tests.ctx('alice'));
insert into public.cart_items (merchant_id, account_id, product_id, qty)
values (tests.ctx('merchant'), tests.ctx('alice_acct'), tests.ctx('product'), 1);

select lives_ok(
  $$ select public.place_order('cccccccc-0000-4000-8000-000000000001'::uuid, tests.ctx('store'), null, 40) $$,
  'checkout redeeming 40 points');

select tests.act_as_service();
select lives_ok(
  $$ select public.fulfill_order(o.id, 'pay_test_1') from public.orders o
     where o.account_id = tests.ctx('alice_acct') $$,
  'payment webhook (service_role) fulfils the order');
select is(
  (select balance from public.point_balances where loyalty_account_id = tests.ctx('alice_acct')),
  179::bigint,
  '100 signup - 40 redeemed + 119 earned (₹1,190 paid x 10%)');

select tests.act_as(tests.ctx('alice'));
select throws_ok(
  $$ select public.redeem_reward(tests.ctx('voucher'), gen_random_uuid()) $$,
  'P0001', 'insufficient_points', 'cannot redeem a 400-point reward holding 179');
select lives_ok(
  $$ select public.redeem_reward(tests.ctx('gift'), gen_random_uuid()) $$,
  'can redeem a 150-point reward');

insert into public.cart_items (merchant_id, account_id, product_id, qty)
values (tests.ctx('merchant'), tests.ctx('alice_acct'), tests.ctx('product'), 1);
select throws_ok(
  $$ select public.place_order(gen_random_uuid(), tests.ctx('store'), null, 1000) $$,
  'P0001', 'insufficient_points', 'checkout cannot redeem more points than held');

-- ---------------------------------------------------------- invariants ---
select tests.reset();

select is(
  (select coalesce(sum(amount), 0) from public.ledger_entries)::bigint, 0::bigint,
  'all ledger entries sum to zero');
select is_empty(
  $$ select txn_id from public.ledger_entries group by txn_id having sum(amount) <> 0 $$,
  'every transaction is balanced');
select is_empty(
  $$ select b.loyalty_account_id from public.point_balances b
     where b.balance <> (
       select coalesce(sum(e.amount), 0)
       from public.ledger_entries e
       join public.ledger_accounts la on la.id = e.ledger_account_id
       where la.loyalty_account_id = b.loyalty_account_id) $$,
  'materialised balances equal the ledger for every account');
select is_empty(
  $$ select b.loyalty_account_id from public.point_balances b
     where b.balance <> (
       select coalesce(sum(l.remaining), 0)
       from public.point_lots l
       where l.loyalty_account_id = b.loyalty_account_id) $$,
  'open lots equal balance for every account');
select is(
  (select balance from public.point_balances where loyalty_account_id = tests.ctx('alice_acct')),
  29::bigint, '179 - 150 = 29');

-- --------------------------------------- raw-table guards (RPCs bypassed) ---
select throws_like(
  format($$ select tests.raw_post('[{"account":"%s","amount":-1000},{"account":"%s","amount":1000}]'::jsonb, 'test:overdraft', false) $$,
         tests.ctx('alice_la'), tests.ctx('issued_la')),
  '%point_balances_non_negative%',
  'the CHECK constraint rejects an overdraft even when the RPC layer is bypassed');

select throws_ok(
  format($$ select tests.raw_post('[{"account":"%s","amount":50}]'::jsonb, 'test:unbalanced', true) $$,
         tests.ctx('alice_la')),
  '23514', 'ledger_unbalanced', 'a one-legged (unbalanced) transaction is rejected');
set constraints all deferred;

select lives_ok(
  format($$ select tests.raw_post('[{"account":"%s","amount":30},{"account":"%s","amount":-20},{"account":"%s","amount":-10}]'::jsonb, 'test:three-leg', true) $$,
         tests.ctx('alice_la'), tests.ctx('issued_la'), tests.ctx('adjustment_la')),
  'a balanced three-leg transaction is accepted');

select throws_ok(
  $$ update public.ledger_entries set amount = amount + 1 $$,
  'P0001', 'ledger_is_append_only', 'ledger entries cannot be modified');
select throws_ok(
  $$ delete from public.ledger_transactions $$,
  'P0001', 'ledger_is_append_only', 'ledger transactions cannot be deleted');

select * from finish();
rollback;
