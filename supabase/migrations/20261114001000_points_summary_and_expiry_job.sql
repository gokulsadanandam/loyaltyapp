-- Phase 3: customer-facing points summary + scheduled expiry.

-- -----------------------------------------------------------------------------
-- my_points_summary(): the caller's balance split into what can actually be spent.
--
-- point_balances.balance still includes lots that have passed expires_at but have
-- not been swept by expire_points() yet. place_order/redeem_reward only allow
-- spending unexpired lots, so the UI must show `available`, not `balance`.
-- SECURITY INVOKER: every read goes through the caller's RLS (own rows only).
-- -----------------------------------------------------------------------------
create function public.my_points_summary()
returns table (
  account_id       uuid,
  balance          bigint,
  available        bigint,
  lifetime_earned  bigint,
  expiring_30d     bigint,
  next_expiry_at   timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id,
    b.balance,
    coalesce((select sum(l.remaining) from public.point_lots l
              where l.loyalty_account_id = a.id and l.remaining > 0
                and (l.expires_at is null or l.expires_at > now())), 0)::bigint,
    b.lifetime_earned,
    coalesce((select sum(l.remaining) from public.point_lots l
              where l.loyalty_account_id = a.id and l.remaining > 0
                and l.expires_at > now() and l.expires_at <= now() + interval '30 days'), 0)::bigint,
    (select min(l.expires_at) from public.point_lots l
      where l.loyalty_account_id = a.id and l.remaining > 0 and l.expires_at > now())
  from public.loyalty_accounts a
  join public.point_balances b on b.loyalty_account_id = a.id
  where a.user_id = (select auth.uid())
    and a.merchant_id = private.default_merchant_id();
$$;

revoke execute on function public.my_points_summary() from public;
grant execute on function public.my_points_summary() to authenticated;

-- -----------------------------------------------------------------------------
-- Nightly expiry sweep. expire_points() is SECURITY DEFINER, idempotent per lot
-- ('expire:<lot id>'), and takes the same balance-row lock as every RPC, so it is
-- safe to run concurrently with checkouts. 21:30 UTC = 03:00 IST (low traffic).
-- cron.schedule upserts by job name, so re-running this migration is harmless.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'expire-points-nightly',
  '30 21 * * *',
  $$ select private.expire_points() $$
);
