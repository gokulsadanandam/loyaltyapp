-- Clients cannot write ledger/balances/orders directly, and staff-only RPCs reject customers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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
  ('alice', tests.create_user('alice@test.local'));
insert into ctx select 'alice_acct', id from public.loyalty_accounts where user_id = tests.ctx('alice');
insert into ctx select 'product', id from public.products where sku = 'LGC-001';
insert into ctx select 'store', id from public.stores where name = 'Indiranagar';

select tests.act_as(tests.ctx('alice'));

-- ------------------------------------------------ direct table writes ---
select throws_ok(
  $$ insert into public.ledger_entries (txn_id, ledger_account_id, amount)
     values (gen_random_uuid(), gen_random_uuid(), 100) $$,
  '42501', 'permission denied for table ledger_entries', 'cannot INSERT ledger_entries');
select throws_ok(
  $$ update public.ledger_entries set amount = 999 $$,
  '42501', 'permission denied for table ledger_entries', 'cannot UPDATE ledger_entries');
select throws_ok(
  $$ delete from public.ledger_entries $$,
  '42501', 'permission denied for table ledger_entries', 'cannot DELETE ledger_entries');
select throws_ok(
  $$ insert into public.ledger_transactions (merchant_id, kind, idempotency_key)
     values (tests.ctx('merchant'), 'adjust', 'forged') $$,
  '42501', 'permission denied for table ledger_transactions', 'cannot INSERT ledger_transactions');
select throws_ok(
  $$ update public.point_balances set balance = 1000000 $$,
  '42501', 'permission denied for table point_balances', 'cannot UPDATE point_balances');
select throws_ok(
  $$ insert into public.point_balances (loyalty_account_id, balance) values (gen_random_uuid(), 5) $$,
  '42501', 'permission denied for table point_balances', 'cannot INSERT point_balances');
select throws_ok(
  $$ update public.point_lots set remaining = 99999 $$,
  '42501', 'permission denied for table point_lots', 'cannot UPDATE point_lots');
select throws_ok(
  $$ insert into public.orders (merchant_id, account_id, store_id, subtotal_paise, total_paise, idempotency_key)
     values (tests.ctx('merchant'), tests.ctx('alice_acct'), tests.ctx('store'), 1, 1, gen_random_uuid()) $$,
  '42501', 'permission denied for table orders', 'cannot INSERT orders (no client-priced orders)');
select throws_ok(
  $$ update public.orders set total_paise = 1 $$,
  '42501', 'permission denied for table orders', 'cannot UPDATE orders');
select throws_ok(
  $$ update public.profiles set member_code = 'LYHACKED' where id = auth.uid() $$,
  '42501', 'permission denied for table profiles', 'cannot change own member_code (column grant)');
select lives_ok(
  $$ update public.profiles set first_name = 'Alicia' where id = auth.uid() $$,
  'can edit own name');
select throws_ok(
  $$ select private.post_points(tests.ctx('alice_acct'), 'adjust', 1000, 'forged') $$,
  '42501', 'permission denied for function post_points', 'cannot call internal posting primitive');

-- ---------------------------------------------------- RPC authorization ---
insert into public.cart_items (merchant_id, account_id, product_id, qty)
values (tests.ctx('merchant'), tests.ctx('alice_acct'), tests.ctx('product'), 1);

select lives_ok(
  $$ select public.place_order('bbbbbbbb-0000-4000-8000-000000000001'::uuid, tests.ctx('store')) $$,
  'customer can place an order');
select throws_ok(
  $$ select public.fulfill_order(o.id) from public.orders o $$,
  '42501', 'forbidden', 'customer cannot fulfil (earn on) their own order');
select throws_ok(
  $$ select public.refund_order(o.id, 'want my points back') from public.orders o $$,
  '42501', 'forbidden', 'customer cannot refund their own order');
select throws_ok(
  $$ select public.admin_adjust(tests.ctx('alice_acct'), 1000, 'giving myself points', gen_random_uuid()) $$,
  '42501', 'forbidden', 'customer cannot call admin_adjust');
select throws_ok(
  $$ select public.staff_award_points(
       (select member_code from public.profiles where id = auth.uid()), 100000, gen_random_uuid()) $$,
  '42501', 'forbidden', 'customer cannot call staff_award_points');
select is((select balance from public.point_balances), 100::bigint,
  'balance untouched by every rejected attempt');

select tests.act_as_anon();
select throws_ok(
  $$ select public.place_order(gen_random_uuid(), null, null, 0) $$,
  '42501', 'permission denied for function place_order', 'anon cannot call place_order');

-- Function privilege allow-list. Postgres grants EXECUTE to PUBLIC on every new
-- function, so a migration that forgets its `revoke ... from public` shows up here.
select tests.reset();
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and (p.proacl is null or exists (
         select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')) $$,
  'no public/private function is executable by PUBLIC');
select results_eq(
  $$ select p.oid::regprocedure::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
     order by 1 $$,
  $$ values ('nearby_stores(double precision,double precision,integer,uuid)'),
            ('private.default_merchant_id()') $$,
  'anon can execute exactly nearby_stores and its default_merchant_id helper');
select results_eq(
  $$ select p.oid::regprocedure::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and has_function_privilege('authenticated', p.oid, 'execute')
     order by 1 $$,
  $$ values ('admin_adjust(uuid,integer,text,uuid)'),
            ('fulfill_order(uuid,text)'),
            ('merchant_analytics(integer,uuid)'),
            ('my_points_summary()'),
            ('my_referrals()'),
            ('nearby_stores(double precision,double precision,integer,uuid)'),
            ('place_order(uuid,uuid,jsonb,integer,uuid)'),
            ('private.can_read_account(uuid)'),
            ('private.can_read_ledger_account(uuid)'),
            ('private.default_merchant_id()'),
            ('private.has_merchant_role(uuid,staff_role[])'),
            ('private.is_staff_for_user(uuid)'),
            ('private.owns_account(uuid)'),
            ('private.try_uuid(text)'),
            ('redeem_reward(uuid,uuid)'),
            ('refund_order(uuid,text)'),
            ('staff_award_points(text,bigint,uuid,uuid,uuid)') $$,
  'authenticated can execute exactly the RPCs and RLS helpers');

select tests.reset();
select * from finish();
rollback;
