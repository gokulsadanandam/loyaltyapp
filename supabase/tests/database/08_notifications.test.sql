-- Notifications: sources, dedupe, privacy, and the email outbox lifecycle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
create function pg_temp.count_kind(p_uid uuid, p_kind text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = p_uid and kind::text = p_kind;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'notify1@test.local', '', now(), '{}',
   '{"first_name":"Nia"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'notify2@test.local', '', now(), '{}', '{}', now(), now());
insert into ctx select 'acct', id from public.loyalty_accounts
  where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1';

-- ------------------------------------------------------------- tier up ---
select is(pg_temp.count_kind('aaaaaaaa-0000-4000-8000-0000000000a1', 'tier_up'), 0,
  'base tier assigned at signup is not announced');

select private.post_points((select v from ctx where k = 'acct'), 'earn', 2000, 'test:earn:1');
select is(pg_temp.count_kind('aaaaaaaa-0000-4000-8000-0000000000a1', 'tier_up'), 1,
  'reaching Gold creates a tier_up notification');
select is((select title from public.notifications
            where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' and kind = 'tier_up'),
  'Welcome to Gold', 'tier_up names the new tier');
select matches((select body from public.notifications
            where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' and kind = 'tier_up'),
  '1\.25× points', 'tier_up states the new multiplier');

select private.post_points((select v from ctx where k = 'acct'), 'earn_reversal', -1500, 'test:rev:1');
select is((select t.name from public.loyalty_accounts a join public.tiers t on t.id = a.tier_id
            where a.id = (select v from ctx where k = 'acct')), 'Silver',
  'a clawback drops the member back to Silver');
select is(pg_temp.count_kind('aaaaaaaa-0000-4000-8000-0000000000a1', 'tier_up'), 1,
  'downgrades are not notified');
select private.post_points((select v from ctx where k = 'acct'), 'earn', 1500, 'test:earn:2');
select is(pg_temp.count_kind('aaaaaaaa-0000-4000-8000-0000000000a1', 'tier_up'), 1,
  'regaining Gold does not notify twice');

-- ------------------------------------------------------- expiring soon ---
update public.point_lots set expires_at = now() + interval '3 days'
  where loyalty_account_id = (select v from ctx where k = 'acct');
select ok(private.notify_expiring_points(7) >= 1, 'reminder job finds lots expiring within 7 days');
select private.notify_expiring_points(7);
select is(pg_temp.count_kind('aaaaaaaa-0000-4000-8000-0000000000a1', 'points_expiring'), 1,
  're-running the job does not repeat the reminder');
select matches((select title from public.notifications
            where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' and kind = 'points_expiring'),
  '^\d+ points expire soon$', 'reminder title states the amount');

-- ------------------------------------------------------------- expired ---
update public.point_lots set expires_at = now() - interval '1 minute'
  where loyalty_account_id = (select v from ctx where k = 'acct');
select ok(private.expire_points() >= 2, 'sweep expires several lots');
select is(pg_temp.count_kind('aaaaaaaa-0000-4000-8000-0000000000a1', 'points_expired'), 1,
  'several expired lots produce one summary');
select is(
  (select (data ->> 'points')::bigint from public.notifications
     where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' and kind = 'points_expired'),
  (select -sum(e.amount)::bigint from public.ledger_entries e
     join public.ledger_transactions t on t.id = e.txn_id
     join public.ledger_accounts la on la.id = e.ledger_account_id
    where t.kind = 'expire' and la.loyalty_account_id = (select v from ctx where k = 'acct')),
  'summary total equals the points actually expired');

-- ------------------------------------------------------ member privacy ---
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000a1');
select is((select count(*)::int from public.notifications), 3, 'member sees their 3 notifications');
select throws_ok('select email_status from public.notifications',
  '42501', null, 'delivery bookkeeping is not readable by members');
select lives_ok('update public.notifications set read_at = now() where kind = ''tier_up''',
  'member can mark a notification read');
select throws_ok('update public.notifications set title = ''hacked''',
  '42501', null, 'member cannot edit notification text');
select throws_ok($$ insert into public.notifications (user_id, merchant_id, kind, title, body, dedupe_key)
  values (auth.uid(), 'b0000000-0000-4000-8000-000000000001', 'tier_up', 'x', 'y', 'z') $$,
  '42501', null, 'member cannot create notifications');
select throws_ok('select * from public.claim_notification_emails(10)',
  '42501', null, 'members cannot drain the email outbox');
select pg_temp.reset();

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000a2');
select is((select count(*)::int from public.notifications), 0,
  'other members see none of them');
select pg_temp.reset();

-- ------------------------------------------------------------ opt-out ---
update public.profiles set email_notifications = false
  where id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
select private.notify('aaaaaaaa-0000-4000-8000-0000000000a1', 'b0000000-0000-4000-8000-000000000001',
  'tier_up', 'Opt-out check', 'body', '/account', '{}', 'test:optout');
select is((select email_status from public.notifications where dedupe_key = 'test:optout'),
  'skipped', 'opted-out members get in-app notifications but no email');

-- ------------------------------------------------------- email outbox ---
update public.notifications set email_status = 'skipped' where email_status = 'pending'
  and user_id <> 'aaaaaaaa-0000-4000-8000-0000000000a1';  -- isolate from seed/other rows
select pg_temp.act_as_service();
insert into ctx select 'claimed', id from public.claim_notification_emails(50)
  where email = 'notify1@test.local' limit 1;
select is((select count(*)::int from public.claim_notification_emails(50)), 0,
  'claimed rows are not handed out twice');
select public.complete_notification_email((select v from ctx where k = 'claimed'), true);
select is((select email_status from public.notifications where id = (select v from ctx where k = 'claimed')),
  'sent', 'a successful send is recorded');

-- Failure path: retried until 3 attempts, then parked as failed.
update public.notifications set email_status = 'pending', email_attempts = 0
  where id = (select v from ctx where k = 'claimed');
select public.claim_notification_emails(50);
select public.complete_notification_email((select v from ctx where k = 'claimed'), false, 'smtp down');
select public.claim_notification_emails(50);
select public.complete_notification_email((select v from ctx where k = 'claimed'), false, 'smtp down');
select public.claim_notification_emails(50);
select public.complete_notification_email((select v from ctx where k = 'claimed'), false, 'smtp down');
select is((select email_status || ':' || email_attempts from public.notifications
            where id = (select v from ctx where k = 'claimed')),
  'failed:3', 'three failed attempts park the email as failed');
select pg_temp.reset();

select * from finish();
rollback;
