-- Phase 3: member notifications (in-app feed + email outbox).
--
-- Sources (all server-side, all idempotent via dedupe_key):
--   tier_up          loyalty_accounts.tier_id moves to a HIGHER tier
--   points_expiring  nightly job: lots expiring within 7 days (one per earliest date)
--   points_expired   expire_points() sweep: one summary per member per IST day
-- Email: rows start 'pending' (or 'skipped' if the member opted out); a worker
-- claims them with claim_notification_emails() and reports back per row.

create type public.notification_kind as enum ('tier_up', 'points_expiring', 'points_expired');

alter table public.profiles
  add column email_notifications boolean not null default true;
grant update (email_notifications) on public.profiles to authenticated;  -- RLS: self

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  merchant_id    uuid not null references public.merchants (id) on delete cascade,
  kind           public.notification_kind not null,
  title          text not null check (length(title) between 1 and 200),
  body           text not null check (length(body) between 1 and 1000),
  link           text check (link ~ '^/[A-Za-z0-9/_?=&.-]*$'),  -- same-origin path only
  data           jsonb not null default '{}'::jsonb,
  dedupe_key     text not null unique,
  read_at        timestamptz,
  email_status   text not null default 'pending'
                 check (email_status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  email_attempts integer not null default 0,
  email_error    text,
  emailed_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_email_queue_idx on public.notifications (created_at)
  where email_status = 'pending';

alter table public.notifications enable row level security;
create policy "notifications: own read" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: own mark read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Members see the message, not the delivery bookkeeping; they may only set read_at.
grant select (id, kind, title, body, link, data, read_at, created_at)
  on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- -----------------------------------------------------------------------------
-- private.notify: the only writer. Duplicate dedupe_key -> no-op.
-- -----------------------------------------------------------------------------
create function private.notify(
  p_user_id uuid, p_merchant_id uuid, p_kind public.notification_kind,
  p_title text, p_body text, p_link text, p_data jsonb, p_dedupe_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications
    (user_id, merchant_id, kind, title, body, link, data, dedupe_key, email_status)
  select p_user_id, p_merchant_id, p_kind, p_title, p_body, p_link, coalesce(p_data, '{}'),
         p_dedupe_key,
         case when coalesce(p.email_notifications, true) then 'pending' else 'skipped' end
  from (select 1) one
  left join public.profiles p on p.id = p_user_id
  on conflict (dedupe_key) do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tier up (never on a downgrade, e.g. after a refund clawback).
-- -----------------------------------------------------------------------------
create function private.notify_tier_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new public.tiers%rowtype;
  v_old_min integer;
begin
  -- No previous tier = the base tier assigned at signup: not an achievement.
  if old.tier_id is null then
    return null;
  end if;
  select * into v_new from public.tiers t where t.id = new.tier_id;
  if v_new.id is null then
    return null;
  end if;
  select t.min_lifetime_points into v_old_min from public.tiers t where t.id = old.tier_id;
  if v_new.min_lifetime_points <= coalesce(v_old_min, -1) then
    return null;
  end if;

  perform private.notify(
    new.user_id, new.merchant_id, 'tier_up',
    format('Welcome to %s', v_new.name),
    format('You''ve reached %s. From now on you earn %s× points on every order.',
           v_new.name, trim(to_char(v_new.multiplier_bps / 10000.0, 'FM990.99'))),
    '/account',
    jsonb_build_object('tier', v_new.name, 'multiplier_bps', v_new.multiplier_bps),
    'tier_up:' || new.id || ':' || v_new.id);
  return null;
end;
$$;

create trigger loyalty_accounts_notify_tier
  after update of tier_id on public.loyalty_accounts
  for each row
  when (new.tier_id is distinct from old.tier_id)
  execute function private.notify_tier_change();

-- -----------------------------------------------------------------------------
-- Expiring soon: one reminder per account per earliest-expiry date in the window.
-- -----------------------------------------------------------------------------
create function private.notify_expiring_points(p_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_count integer := 0;
  v_date  text;
begin
  for r in
    select a.id as account_id, a.user_id, a.merchant_id,
           sum(l.remaining)::bigint as points, min(l.expires_at) as first_expiry
    from public.point_lots l
    join public.loyalty_accounts a on a.id = l.loyalty_account_id
    where l.remaining > 0
      and l.expires_at > now()
      and l.expires_at <= now() + make_interval(days => p_days)
    group by a.id, a.user_id, a.merchant_id
  loop
    v_date := to_char(r.first_expiry at time zone 'Asia/Kolkata', 'DD Mon YYYY');
    perform private.notify(
      r.user_id, r.merchant_id, 'points_expiring',
      format('%s points expire soon', r.points),
      format('%s of your points expire on %s. Use them at checkout or on a reward before then.',
             r.points, v_date),
      '/rewards',
      jsonb_build_object('points', r.points, 'expires_at', r.first_expiry),
      'expiring:' || r.account_id || ':' || to_char(r.first_expiry at time zone 'Asia/Kolkata', 'YYYY-MM-DD'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 21:00 UTC = 02:30 IST, before the 03:00 IST expiry sweep.
select cron.schedule('notify-expiring-points-nightly', '0 21 * * *',
  $$ select private.notify_expiring_points(7) $$);

-- -----------------------------------------------------------------------------
-- Expired: summarise the sweep per member per IST day (several lots -> one row).
-- -----------------------------------------------------------------------------
create function private.notify_points_expired()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind    public.ledger_txn_kind;
  v_acct    public.loyalty_accounts%rowtype;
  v_points  bigint := -new.amount;
  v_key     text;
begin
  select t.kind into v_kind from public.ledger_transactions t where t.id = new.txn_id;
  if v_kind is distinct from 'expire' or new.amount >= 0 then
    return null;
  end if;
  select a.* into v_acct
  from public.ledger_accounts la
  join public.loyalty_accounts a on a.id = la.loyalty_account_id
  where la.id = new.ledger_account_id and la.kind = 'customer';
  if v_acct.id is null then
    return null;
  end if;

  v_key := 'expired:' || v_acct.id || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');

  -- Upsert: several lots expiring in the same sweep fold into one summary. Each
  -- ledger entry is inserted exactly once (append-only), so this never double-counts.
  insert into public.notifications
    (user_id, merchant_id, kind, title, body, link, data, dedupe_key, email_status)
  select v_acct.user_id, v_acct.merchant_id, 'points_expired',
         format('%s points expired', v_points),
         format('%s points reached their expiry date and were removed from your balance.', v_points),
         '/account/points', jsonb_build_object('points', v_points), v_key,
         case when coalesce(p.email_notifications, true) then 'pending' else 'skipped' end
  from (select 1) one
  left join public.profiles p on p.id = v_acct.user_id
  on conflict (dedupe_key) do update
     set data  = jsonb_build_object('points', (notifications.data ->> 'points')::bigint + v_points),
         title = format('%s points expired', (notifications.data ->> 'points')::bigint + v_points),
         body  = format('%s points reached their expiry date and were removed from your balance.',
                        (notifications.data ->> 'points')::bigint + v_points);
  return null;
end;
$$;

create trigger ledger_entries_notify_expired
  after insert on public.ledger_entries
  for each row execute function private.notify_points_expired();

-- -----------------------------------------------------------------------------
-- Email outbox, for the delivery worker (service_role only).
-- -----------------------------------------------------------------------------
create function public.claim_notification_emails(p_limit integer default 50)
returns table (id uuid, email text, first_name text, title text, body text, link text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select n.id
    from public.notifications n
    where n.email_status = 'pending'
    order by n.created_at
    limit least(greatest(p_limit, 1), 200)
    for update skip locked   -- concurrent workers never claim the same row
  ), claimed as (
    update public.notifications n
       set email_status = 'sending', email_attempts = n.email_attempts + 1
      from picked
     where n.id = picked.id
    returning n.id, n.user_id, n.title, n.body, n.link
  )
  select c.id, u.email::text, p.first_name, c.title, c.body, c.link
  from claimed c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id;
end;
$$;

-- Failed sends go back to the queue until 3 attempts, then stay 'failed'.
create function public.complete_notification_email(p_id uuid, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set email_status = case when p_ok then 'sent'
                             when n.email_attempts >= 3 then 'failed'
                             else 'pending' end,
         emailed_at   = case when p_ok then now() else n.emailed_at end,
         email_error  = case when p_ok then null else left(p_error, 500) end
   where n.id = p_id and n.email_status = 'sending';
$$;

revoke execute on function private.notify(uuid, uuid, public.notification_kind, text, text, text, jsonb, text) from public;
revoke execute on function private.notify_tier_change() from public;
revoke execute on function private.notify_expiring_points(integer) from public;
revoke execute on function private.notify_points_expired() from public;
revoke execute on function public.claim_notification_emails(integer) from public;
revoke execute on function public.complete_notification_email(uuid, boolean, text) from public;
grant execute on function public.claim_notification_emails(integer) to service_role;
grant execute on function public.complete_notification_email(uuid, boolean, text) to service_role;
