-- Phase 4: merchant analytics for owners/admins.
--
-- One round trip, aggregated in SQL. SECURITY DEFINER so it can count across
-- every member, gated on a live owner/admin role check (same as the RPCs).
-- Points are reported from the customer side of the ledger (customer accounts only).

create function public.merchant_analytics(p_days integer default 30, p_merchant_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := coalesce(p_merchant_id, private.default_merchant_id());
  v_days     integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since    timestamptz := now() - make_interval(days => v_days);
  v_value    integer;
  v_result   jsonb;
begin
  if not private.has_merchant_role(v_merchant, array['owner', 'admin']::public.staff_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.point_value_paise into v_value from public.merchants m where m.id = v_merchant;

  with
  customer_entries as (
    select e.amount, e.created_at, t.kind
    from public.ledger_entries e
    join public.ledger_transactions t on t.id = e.txn_id
    join public.ledger_accounts la on la.id = e.ledger_account_id
    where la.merchant_id = v_merchant and la.kind = 'customer'
  ),
  liability as (
    select coalesce(sum(l.remaining), 0)::bigint as available
    from public.point_lots l
    join public.loyalty_accounts a on a.id = l.loyalty_account_id
    where a.merchant_id = v_merchant and l.remaining > 0
      and (l.expires_at is null or l.expires_at > now())
  ),
  flows as (
    select
      coalesce(sum(amount) filter (where amount > 0 and kind in ('signup', 'earn', 'referral', 'adjust', 'migration')), 0)::bigint as issued,
      coalesce(-sum(amount) filter (where kind = 'redeem'), 0)::bigint
        - coalesce(sum(amount) filter (where kind = 'redeem_reversal'), 0)::bigint as redeemed,
      coalesce(-sum(amount) filter (where kind = 'expire'), 0)::bigint as expired
    from customer_entries where created_at >= v_since
  ),
  lifetime as (
    select
      coalesce(sum(amount) filter (where amount > 0 and kind in ('signup', 'earn', 'referral', 'adjust', 'migration')), 0)::bigint as issued,
      coalesce(-sum(amount) filter (where kind = 'redeem'), 0)::bigint
        - coalesce(sum(amount) filter (where kind = 'redeem_reversal'), 0)::bigint as redeemed
    from customer_entries
  ),
  members as (
    select
      count(*)::int as total,
      count(*) filter (where a.created_at >= v_since)::int as new_members
    from public.loyalty_accounts a where a.merchant_id = v_merchant
  ),
  active as (
    -- Active = completed an order or earned/redeemed points in the window.
    select count(distinct la.loyalty_account_id)::int as n
    from public.ledger_entries e
    join public.ledger_transactions t on t.id = e.txn_id
    join public.ledger_accounts la on la.id = e.ledger_account_id
    where la.merchant_id = v_merchant and la.kind = 'customer'
      and e.created_at >= v_since and t.kind in ('earn', 'redeem')
  ),
  orders as (
    select
      count(*)::int as fulfilled,
      coalesce(sum(o.total_paise), 0)::bigint as revenue_paise
    from public.orders o
    where o.merchant_id = v_merchant and o.status = 'fulfilled' and o.fulfilled_at >= v_since
  ),
  repeat as (
    select
      count(*) filter (where n >= 1)::int as buyers,
      count(*) filter (where n >= 2)::int as repeat_buyers
    from (
      select o.account_id, count(*) as n from public.orders o
      where o.merchant_id = v_merchant and o.status = 'fulfilled'
      group by o.account_id
    ) per_account
  ),
  tiers as (
    select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'members', coalesce(c.n, 0))
                              order by t.min_lifetime_points), '[]'::jsonb) as mix
    from public.tiers t
    left join (
      select a.tier_id, count(*)::int as n from public.loyalty_accounts a
      where a.merchant_id = v_merchant group by a.tier_id
    ) c on c.tier_id = t.id
    where t.merchant_id = v_merchant
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'day', d.day, 'issued', coalesce(x.issued, 0), 'redeemed', coalesce(x.redeemed, 0))
             order by d.day), '[]'::jsonb) as series
    from (
      select generate_series(
        (now() at time zone 'Asia/Kolkata')::date - (v_days - 1),
        (now() at time zone 'Asia/Kolkata')::date, interval '1 day')::date as day
    ) d
    left join (
      select (created_at at time zone 'Asia/Kolkata')::date as day,
             sum(amount) filter (where amount > 0 and kind in ('signup', 'earn', 'referral', 'adjust', 'migration'))::bigint as issued,
             -sum(amount) filter (where kind = 'redeem')::bigint as redeemed
      from customer_entries where created_at >= v_since
      group by 1
    ) x on x.day = d.day
  )
  select jsonb_build_object(
    'days', v_days,
    'point_value_paise', v_value,
    'liability', jsonb_build_object(
      'points', liability.available,
      'paise', liability.available * v_value),
    'points', jsonb_build_object(
      'issued', flows.issued, 'redeemed', flows.redeemed, 'expired', flows.expired,
      'lifetime_issued', lifetime.issued, 'lifetime_redeemed', lifetime.redeemed),
    'members', jsonb_build_object(
      'total', members.total, 'new', members.new_members, 'active', active.n),
    'orders', jsonb_build_object(
      'fulfilled', orders.fulfilled, 'revenue_paise', orders.revenue_paise,
      'avg_order_paise', case when orders.fulfilled > 0
                              then orders.revenue_paise / orders.fulfilled else 0 end),
    'repeat', jsonb_build_object(
      'buyers', repeat.buyers, 'repeat_buyers', repeat.repeat_buyers),
    'tiers', tiers.mix,
    'daily', daily.series)
  into v_result
  from liability, flows, lifetime, members, active, orders, repeat, tiers, daily;

  return v_result;
end;
$$;

revoke execute on function public.merchant_analytics(integer, uuid) from public;
grant execute on function public.merchant_analytics(integer, uuid) to authenticated;
