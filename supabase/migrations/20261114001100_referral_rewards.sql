-- Phase 3: referral rewards.
--
-- profiles.referred_by is set at signup from a referral code (handle_new_user).
-- When the referred member's FIRST qualifying order (total >= the merchant
-- minimum) is fulfilled, both people earn points:
--   referee  -> referral_referee_points  (key 'referral:referee:<referee user id>')
--   referrer -> referral_referrer_points (key 'referral:referrer:<referee user id>')
-- One award per referee per merchant, ever. A later refund of that order does not
-- claw the bonus back (documented business rule; revisit with fraud data).

alter table public.merchants
  add column referral_referrer_points integer not null default 200
    check (referral_referrer_points >= 0),
  add column referral_referee_points integer not null default 100
    check (referral_referee_points >= 0),
  add column referral_min_order_paise bigint not null default 50000
    check (referral_min_order_paise >= 0);

grant update (referral_referrer_points, referral_referee_points, referral_min_order_paise)
  on public.merchants to authenticated;  -- RLS: owner/admin only

-- Runs inside fulfill_order's transaction (AFTER UPDATE of status), so a failure
-- here rolls the fulfilment back rather than leaving a half-awarded referral.
create function private.award_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referee_user  uuid;
  v_referrer_user uuid;
  v_referrer_acct uuid;
  v_referrer_pts  integer;
  v_referee_pts   integer;
  v_min_paise     bigint;
begin
  select a.user_id into v_referee_user
  from public.loyalty_accounts a where a.id = new.account_id;

  select p.referred_by into v_referrer_user
  from public.profiles p where p.id = v_referee_user;
  if v_referrer_user is null or v_referrer_user = v_referee_user then
    return null;
  end if;

  select m.referral_referrer_points, m.referral_referee_points, m.referral_min_order_paise
    into v_referrer_pts, v_referee_pts, v_min_paise
  from public.merchants m where m.id = new.merchant_id;
  if new.total_paise < v_min_paise then
    return null;
  end if;

  -- Same lock every points write takes; serialises concurrent fulfilments for
  -- this referee so "already awarded?" is checked race-free.
  perform 1 from public.point_balances b
  where b.loyalty_account_id = new.account_id
  for update;

  -- Only the first qualifying order. Checked explicitly: post_points would raise
  -- idempotency_key_reused for a different order (ref_id), failing the fulfilment.
  if exists (
    select 1 from public.ledger_transactions t
    where t.merchant_id = new.merchant_id
      and t.idempotency_key = 'referral:referee:' || v_referee_user
  ) then
    return null;
  end if;

  if v_referee_pts > 0 then
    perform private.post_points(
      new.account_id, 'referral', v_referee_pts, 'referral:referee:' || v_referee_user,
      'order', new.id, 'Referral bonus: your first order');
  end if;

  select a.id into v_referrer_acct
  from public.loyalty_accounts a
  where a.user_id = v_referrer_user and a.merchant_id = new.merchant_id;

  if v_referrer_acct is not null and v_referrer_pts > 0 then
    -- No ref_id: the order belongs to the referee and isn't visible to the referrer.
    perform private.post_points(
      v_referrer_acct, 'referral', v_referrer_pts, 'referral:referrer:' || v_referee_user,
      'referral', null, 'Referral bonus: a friend''s first order');
  end if;

  return null;
end;
$$;

create trigger orders_award_referral
  after update of status on public.orders
  for each row
  when (new.status = 'fulfilled' and old.status is distinct from 'fulfilled')
  execute function private.award_referral();

-- -----------------------------------------------------------------------------
-- my_referrals(): counts only. SECURITY DEFINER because the referred members'
-- profiles are not readable by the referrer (RLS); no names or ids leave here.
-- -----------------------------------------------------------------------------
create function public.my_referrals()
returns table (
  invited          integer,
  rewarded         integer,
  points_earned    bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select e.amount
    from public.ledger_entries e
    join public.ledger_transactions t on t.id = e.txn_id
    join public.ledger_accounts la on la.id = e.ledger_account_id
    join public.loyalty_accounts a on a.id = la.loyalty_account_id
    where a.user_id = (select auth.uid())
      and a.merchant_id = private.default_merchant_id()
      and la.kind = 'customer'
      and t.kind = 'referral'
      and t.idempotency_key like 'referral:referrer:%'
  )
  select
    (select count(*)::integer from public.profiles p where p.referred_by = (select auth.uid())),
    (select count(*)::integer from mine),
    (select coalesce(sum(amount), 0)::bigint from mine);
$$;

revoke execute on function private.award_referral() from public;
revoke execute on function public.my_referrals() from public;
grant execute on function public.my_referrals() to authenticated;
