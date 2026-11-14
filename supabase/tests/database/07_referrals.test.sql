-- Referral rewards: first qualifying fulfilled order pays both sides, exactly once.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to public;

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.act_as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.new_user(p_id uuid, p_email text, p_ref text) returns void
language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, '', now(), '{}', jsonb_build_object('referral_code', p_ref), now(), now());
$$;
-- Customer places a pickup order for one unit of `sku`; returns the order id.
create function pg_temp.order_as(p_uid uuid, p_sku text) returns uuid language plpgsql as $$
declare v_acct uuid; v_order uuid;
begin
  select id into v_acct from public.loyalty_accounts where user_id = p_uid;
  insert into public.cart_items (merchant_id, account_id, product_id, qty)
  select p.merchant_id, v_acct, p.id, 1 from public.products p where p.sku = p_sku;
  perform pg_temp.act_as(p_uid);
  v_order := public.place_order(gen_random_uuid(),
    (select id from public.stores where name = 'Indiranagar'), null, 0);
  perform pg_temp.reset();
  return v_order;
end $$;
create function pg_temp.balance(p_uid uuid) returns bigint language sql as $$
  select b.balance from public.point_balances b
  join public.loyalty_accounts a on a.id = b.loyalty_account_id where a.user_id = p_uid;
$$;

-- Referrer R, referee E (signed up with R's code), unrelated member N.
select pg_temp.new_user('aaaaaaaa-0000-4000-8000-0000000000f1', 'referrer@test.local', null);
select pg_temp.new_user('aaaaaaaa-0000-4000-8000-0000000000f2', 'referee@test.local',
  (select referral_code from public.profiles where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'));
select pg_temp.new_user('aaaaaaaa-0000-4000-8000-0000000000f3', 'nobody@test.local', null);

select is((select referred_by from public.profiles where id = 'aaaaaaaa-0000-4000-8000-0000000000f2'),
  'aaaaaaaa-0000-4000-8000-0000000000f1'::uuid, 'signup links the referee to the referrer');

-- Make LGC-004 cheap enough to sit under the ₹500 minimum.
update public.products set list_price_paise = 30000, sale_price_paise = 30000 where sku = 'LGC-004';

-- --------------------------------------------- below minimum: no bonus ---
insert into ctx values ('small', pg_temp.order_as('aaaaaaaa-0000-4000-8000-0000000000f2', 'LGC-004'));
select pg_temp.act_as_service();
select public.fulfill_order((select v from ctx where k = 'small'));
select pg_temp.reset();
select is(pg_temp.balance('aaaaaaaa-0000-4000-8000-0000000000f1'), 100::bigint,
  'a ₹300 order (below the ₹500 minimum) pays the referrer nothing');
select is(pg_temp.balance('aaaaaaaa-0000-4000-8000-0000000000f2'), 130::bigint,
  '... and the referee only the normal 30 earn');

-- --------------------------------------- first qualifying order: both paid ---
insert into ctx values ('first', pg_temp.order_as('aaaaaaaa-0000-4000-8000-0000000000f2', 'LGC-002'));
select pg_temp.act_as_service();
select lives_ok(format('select public.fulfill_order(%L)', (select v from ctx where k = 'first')),
  'fulfilling the first ₹1,200 order succeeds');
select pg_temp.reset();
select is(pg_temp.balance('aaaaaaaa-0000-4000-8000-0000000000f1'), 300::bigint,
  'referrer earns 200 referral points');
select is(pg_temp.balance('aaaaaaaa-0000-4000-8000-0000000000f2'), 350::bigint,
  'referee earns 120 + 100 referral points');

-- ---------------------------------------------- later orders: no repeat ---
insert into ctx values ('second', pg_temp.order_as('aaaaaaaa-0000-4000-8000-0000000000f2', 'LGC-003'));
select pg_temp.act_as_service();
select lives_ok(format('select public.fulfill_order(%L)', (select v from ctx where k = 'second')),
  'a second qualifying order still fulfils (no idempotency clash)');
select pg_temp.reset();
select is(pg_temp.balance('aaaaaaaa-0000-4000-8000-0000000000f1'), 300::bigint,
  'referrer is paid once per referee');
select is(
  (select count(*)::int from public.ledger_transactions where kind = 'referral'
     and idempotency_key like 'referral:%:aaaaaaaa-0000-4000-8000-0000000000f2'),
  2, 'exactly two referral transactions (one per side)');

-- Refund of the first order keeps the referral bonus (documented rule).
select pg_temp.act_as_service();
select public.refund_order((select v from ctx where k = 'first'), 'test refund');
select pg_temp.reset();
select is(pg_temp.balance('aaaaaaaa-0000-4000-8000-0000000000f1'), 300::bigint,
  'refunding the qualifying order does not claw back the referral bonus');

-- Unreferred member: normal earn only.
insert into ctx values ('n', pg_temp.order_as('aaaaaaaa-0000-4000-8000-0000000000f3', 'LGC-002'));
select pg_temp.act_as_service();
select public.fulfill_order((select v from ctx where k = 'n'));
select pg_temp.reset();
select is(pg_temp.balance('aaaaaaaa-0000-4000-8000-0000000000f3'), 220::bigint,
  'members without a referrer get no referral bonus');

select is(
  (select coalesce(sum(e.amount), 0)::bigint from public.ledger_entries e
     join public.ledger_transactions t on t.id = e.txn_id where t.kind = 'referral'),
  0::bigint, 'referral transactions balance to zero');

-- ------------------------------------------------------ my_referrals() ---
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000f1');
select results_eq('select invited, rewarded, points_earned from public.my_referrals()',
  'values (1, 1, 200::bigint)', 'referrer sees 1 invited, 1 rewarded, 200 points');
select pg_temp.reset();
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000f2');
select results_eq('select invited, rewarded, points_earned from public.my_referrals()',
  'values (0, 0, 0::bigint)', 'the referee''s own bonus is not counted as referring someone');
select pg_temp.reset();

select * from finish();
rollback;
