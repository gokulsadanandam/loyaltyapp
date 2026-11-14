-- =============================================================================
-- Public RPCs. Every function:
--   * is SECURITY DEFINER with an empty search_path (fully-qualified names)
--   * authorises explicitly (customer = auth.uid(); staff = live merchant_staff lookup)
--   * takes the per-customer point_balances row lock FIRST, then checks idempotency
--   * never trusts client-supplied prices or point balances
--
-- Error contract (stable `message` strings for the frontend to map):
--   28000 not_authenticated | 42501 forbidden
--   P0001 cart_empty, product_unavailable, insufficient_points, redeem_limit_exceeded,
--         store_not_found, invalid_shipping_address, fulfilment_target_required,
--         reward_unavailable, reward_out_of_stock, member_not_found, order_not_found,
--         invalid_order_status, order_already_fulfilled, idempotency_key_reused, ...
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal helpers
-- -----------------------------------------------------------------------------
create function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- service_role JWT, or a direct DB session with no JWT at all (migrations, cron,
-- psql). Client sessions via PostgREST always carry a role claim.
create function private.is_trusted_caller()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           'none') in ('service_role', 'none');
$$;

create function private.default_merchant_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.is_default and m.active;
$$;

create function private.account_for(p_user_id uuid, p_merchant_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_account uuid;
begin
  select a.id into v_account
  from public.loyalty_accounts a
  where a.user_id = p_user_id
    and a.merchant_id = coalesce(p_merchant_id, private.default_merchant_id());
  if v_account is null then
    raise exception 'account_not_found' using errcode = 'P0001';
  end if;
  return v_account;
end;
$$;

-- points = floor(paise / 100 * earn_rate_bps / 10000 * tier_multiplier_bps / 10000)
create function private.points_for_spend(p_account_id uuid, p_amount_paise bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select floor(
           p_amount_paise::numeric * m.earn_rate_bps * coalesce(t.multiplier_bps, 10000)
           / 10000000000)::bigint
  from public.loyalty_accounts a
  join public.merchants m on m.id = a.merchant_id
  left join public.tiers t on t.id = a.tier_id
  where a.id = p_account_id;
$$;

-- -----------------------------------------------------------------------------
-- place_order: price the cart from the catalog, optionally redeem points,
-- create a `pending` order, clear the cart. Idempotent per (account, key).
-- -----------------------------------------------------------------------------
create function public.place_order(
  p_idempotency_key  uuid,
  p_store_id         uuid default null,
  p_shipping_address jsonb default null,
  p_points_to_redeem integer default 0,
  p_merchant_id      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := private.require_uid();
  v_account     uuid;
  v_merchant    uuid;
  v_balance     bigint;
  v_order       uuid;
  v_items       integer;
  v_unavailable integer;
  v_subtotal    bigint;
  v_point_value integer;
  v_max_bps     integer;
  v_discount    bigint;
  v_cap         bigint;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = 'P0001';
  end if;
  if p_points_to_redeem is null or p_points_to_redeem < 0 then
    raise exception 'invalid_points' using errcode = 'P0001';
  end if;

  v_account := private.account_for(v_uid, p_merchant_id);
  select a.merchant_id into v_merchant from public.loyalty_accounts a where a.id = v_account;

  -- 1. Serialise per customer (concurrent checkouts / redemptions queue here).
  select b.balance into v_balance
  from public.point_balances b
  where b.loyalty_account_id = v_account
  for update;

  -- 2. Idempotent replay (checked under the lock, so no double-insert race).
  select o.id into v_order
  from public.orders o
  where o.account_id = v_account and o.idempotency_key = p_idempotency_key;
  if v_order is not null then
    return v_order;
  end if;

  -- 3. Fulfilment target
  if p_store_id is null and p_shipping_address is null then
    raise exception 'fulfilment_target_required' using errcode = 'P0001';
  end if;
  if p_shipping_address is not null and (
       jsonb_typeof(p_shipping_address) <> 'object'
       or coalesce(length(trim(p_shipping_address ->> 'line1')), 0) = 0
       or coalesce(length(trim(p_shipping_address ->> 'postal_code')), 0) = 0) then
    raise exception 'invalid_shipping_address' using errcode = 'P0001';
  end if;
  if p_store_id is not null and not exists (
       select 1 from public.stores s
       where s.id = p_store_id and s.merchant_id = v_merchant and s.active) then
    raise exception 'store_not_found' using errcode = 'P0001';
  end if;

  -- 4. Price from the catalog. Client prices are never read.
  select count(*), count(*) filter (where not p.active),
         coalesce(sum(p.sale_price_paise * c.qty), 0)
    into v_items, v_unavailable, v_subtotal
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.account_id = v_account;

  if v_items = 0 then
    raise exception 'cart_empty' using errcode = 'P0001';
  end if;
  if v_unavailable > 0 then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;

  -- 5. Points
  select m.point_value_paise, m.max_redeem_bps
    into v_point_value, v_max_bps
  from public.merchants m where m.id = v_merchant;

  if p_points_to_redeem > private.available_points(v_account) then
    raise exception 'insufficient_points' using errcode = 'P0001',
      detail = format('balance %s, requested %s', v_balance, p_points_to_redeem);
  end if;

  v_discount := p_points_to_redeem::bigint * v_point_value;
  v_cap := (v_subtotal * v_max_bps) / 10000;
  if v_discount > v_cap then
    raise exception 'redeem_limit_exceeded' using errcode = 'P0001',
      detail = format('max %s points for this order', v_cap / v_point_value);
  end if;

  -- 6. Persist
  insert into public.orders (
    merchant_id, account_id, store_id, status, subtotal_paise,
    points_redeemed, points_discount_paise, total_paise, shipping_address, idempotency_key)
  values (
    v_merchant, v_account, p_store_id, 'pending', v_subtotal,
    p_points_to_redeem, v_discount, v_subtotal - v_discount, p_shipping_address, p_idempotency_key)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, name_snapshot, list_price_paise, unit_price_paise, qty)
  select v_order, p.id, p.name, p.list_price_paise, p.sale_price_paise, c.qty
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.account_id = v_account;

  if p_points_to_redeem > 0 then
    perform private.post_points(
      v_account, 'redeem', -p_points_to_redeem, 'order:' || v_order || ':redeem',
      'order', v_order, 'Redeemed at checkout');
  end if;

  delete from public.cart_items c where c.account_id = v_account;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- fulfill_order: mark a pending order fulfilled (payment captured / handed over)
-- and post earned points. Caller: payment webhook (service_role) or merchant staff.
-- Idempotent: replays return the original earn transaction id.
-- -----------------------------------------------------------------------------
create function public.fulfill_order(p_order_id uuid, p_payment_ref text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.orders%rowtype;
  v_points bigint;
  v_txn    uuid;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if not (private.is_trusted_caller()
          or private.has_merchant_role(v_order.merchant_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_order.status = 'fulfilled' then
    if p_payment_ref is not null and p_payment_ref is distinct from v_order.payment_ref then
      raise exception 'order_already_fulfilled' using errcode = 'P0001';
    end if;
    select t.id into v_txn
    from public.ledger_transactions t
    where t.merchant_id = v_order.merchant_id
      and t.idempotency_key = 'order:' || v_order.id || ':earn';
    return v_txn;  -- null when the order earned 0 points
  end if;

  if v_order.status <> 'pending' then
    raise exception 'invalid_order_status' using errcode = 'P0001',
      detail = format('order is %s', v_order.status);
  end if;

  perform 1 from public.point_balances b
    where b.loyalty_account_id = v_order.account_id for update;

  v_points := private.points_for_spend(v_order.account_id, v_order.total_paise);

  update public.orders o
     set status        = 'fulfilled',
         fulfilled_at  = now(),
         payment_ref   = coalesce(p_payment_ref, o.payment_ref),
         points_earned = v_points
   where o.id = v_order.id;

  if v_points > 0 then
    select p.posted_txn_id into v_txn
    from private.post_points(
      v_order.account_id, 'earn', v_points, 'order:' || v_order.id || ':earn',
      'order', v_order.id, 'Purchase reward') p;
  end if;

  return v_txn;
end;
$$;

-- -----------------------------------------------------------------------------
-- refund_order: pending -> cancelled, fulfilled -> refunded.
-- Restores redeemed points, then claws back earned points bounded by what is
-- still spendable (shortfall recorded in the transaction metadata).
-- Caller: service_role or merchant owner/admin. Idempotent.
-- -----------------------------------------------------------------------------
create function public.refund_order(p_order_id uuid, p_reason text)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order     public.orders%rowtype;
  v_clawback  bigint;
  v_new       public.order_status;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if not (private.is_trusted_caller()
          or private.has_merchant_role(v_order.merchant_id,
               array['owner', 'admin']::public.staff_role[])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_order.status in ('cancelled', 'refunded') then
    return v_order.status;
  end if;

  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  perform 1 from public.point_balances b
    where b.loyalty_account_id = v_order.account_id for update;

  if v_order.points_redeemed > 0 then
    perform private.post_points(
      v_order.account_id, 'redeem_reversal', v_order.points_redeemed,
      'order:' || v_order.id || ':redeem_reversal', 'order', v_order.id, p_reason);
  end if;

  if v_order.status = 'fulfilled' and v_order.points_earned > 0 then
    v_clawback := least(v_order.points_earned, private.available_points(v_order.account_id));
    if v_clawback > 0 then
      perform private.post_points(
        v_order.account_id, 'earn_reversal', -v_clawback,
        'order:' || v_order.id || ':earn_reversal', 'order', v_order.id, p_reason,
        jsonb_build_object(
          'earned', v_order.points_earned,
          'clawed_back', v_clawback,
          'shortfall', v_order.points_earned - v_clawback));
    end if;
  end if;

  v_new := case when v_order.status = 'fulfilled' then 'refunded' else 'cancelled' end::public.order_status;

  update public.orders o
     set status       = v_new,
         refunded_at  = case when v_new = 'refunded' then now() end,
         cancelled_at = case when v_new = 'cancelled' then now() end
   where o.id = v_order.id;

  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- redeem_reward: spend points on a catalog reward. Idempotent per (account, key);
-- reusing a key for a different reward raises idempotency_key_reused.
-- -----------------------------------------------------------------------------
create function public.redeem_reward(p_reward_id uuid, p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.require_uid();
  v_merchant   uuid;
  v_account    uuid;
  v_reward     public.rewards%rowtype;
  v_existing   public.reward_redemptions%rowtype;
  v_redemption uuid;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = 'P0001';
  end if;

  select r.merchant_id into v_merchant from public.rewards r where r.id = p_reward_id;
  if v_merchant is null then
    raise exception 'reward_unavailable' using errcode = 'P0001';
  end if;
  v_account := private.account_for(v_uid, v_merchant);

  -- Lock order: balance, then reward.
  perform 1 from public.point_balances b where b.loyalty_account_id = v_account for update;

  select * into v_existing
  from public.reward_redemptions rr
  where rr.account_id = v_account and rr.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.reward_id <> p_reward_id then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return v_existing.id;
  end if;

  select * into v_reward from public.rewards r where r.id = p_reward_id for update;

  if not v_reward.active
     or (v_reward.starts_at is not null and v_reward.starts_at > now())
     or (v_reward.ends_at is not null and v_reward.ends_at <= now()) then
    raise exception 'reward_unavailable' using errcode = 'P0001';
  end if;
  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'reward_out_of_stock' using errcode = 'P0001';
  end if;
  if private.available_points(v_account) < v_reward.points_cost then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  insert into public.reward_redemptions (merchant_id, account_id, reward_id, points_spent, idempotency_key)
  values (v_merchant, v_account, v_reward.id, v_reward.points_cost, p_idempotency_key)
  returning id into v_redemption;

  if v_reward.stock is not null then
    update public.rewards r set stock = r.stock - 1 where r.id = v_reward.id;
  end if;

  perform private.post_points(
    v_account, 'redeem', -v_reward.points_cost, 'redemption:' || v_redemption,
    'reward_redemption', v_redemption, v_reward.name);

  return v_redemption;
end;
$$;

-- -----------------------------------------------------------------------------
-- staff_award_points: in-store earn by a cashier scanning the member's code.
-- Phase 2: an Edge Function will verify the rotating, HMAC-signed QR token and
-- pass the resolved member_code here.
-- -----------------------------------------------------------------------------
create function public.staff_award_points(
  p_member_code     text,
  p_amount_paise    bigint,
  p_idempotency_key uuid,
  p_store_id        uuid default null,
  p_merchant_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_merchant uuid := coalesce(p_merchant_id, private.default_merchant_id());
  v_account  uuid;
  v_member   uuid;
  v_points   bigint;
  v_txn      uuid;
begin
  if not private.has_merchant_role(v_merchant) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = 'P0001';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 10000000 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_store_id is not null and not exists (
       select 1 from public.stores s where s.id = p_store_id and s.merchant_id = v_merchant) then
    raise exception 'store_not_found' using errcode = 'P0001';
  end if;

  select a.id, a.user_id into v_account, v_member
  from public.profiles p
  join public.loyalty_accounts a on a.user_id = p.id and a.merchant_id = v_merchant
  where p.member_code = upper(trim(p_member_code));

  if v_account is null then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if v_member = v_uid then
    raise exception 'self_award_forbidden' using errcode = '42501';
  end if;

  perform 1 from public.point_balances b where b.loyalty_account_id = v_account for update;

  v_points := private.points_for_spend(v_account, p_amount_paise);
  if v_points <= 0 then
    raise exception 'amount_too_small' using errcode = 'P0001';
  end if;

  select p.posted_txn_id into v_txn
  from private.post_points(
    v_account, 'earn', v_points, 'staff_award:' || p_idempotency_key,
    'loyalty_account', v_account, 'In-store purchase',
    jsonb_build_object('amount_paise', p_amount_paise, 'store_id', p_store_id, 'staff_id', v_uid)) p;

  return v_txn;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_adjust: manual correction by a merchant owner/admin. Reason required.
-- Negative adjustments consume lots and cannot overdraw.
-- -----------------------------------------------------------------------------
create function public.admin_adjust(
  p_account_id      uuid,
  p_points          integer,
  p_reason          text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_merchant uuid;
  v_txn      uuid;
begin
  select a.merchant_id into v_merchant from public.loyalty_accounts a where a.id = p_account_id;

  -- Same error for "no such account" and "not your merchant": no account enumeration.
  if v_merchant is null
     or not private.has_merchant_role(v_merchant, array['owner', 'admin']::public.staff_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = 'P0001';
  end if;
  if p_points is null or p_points = 0 or abs(p_points) > 1000000 then
    raise exception 'invalid_points' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  perform 1 from public.point_balances b where b.loyalty_account_id = p_account_id for update;

  select p.posted_txn_id into v_txn
  from private.post_points(
    p_account_id, 'adjust', p_points, 'adjust:' || p_idempotency_key,
    'loyalty_account', p_account_id, trim(p_reason),
    jsonb_build_object('admin_id', v_uid)) p;

  return v_txn;
end;
$$;

-- -----------------------------------------------------------------------------
-- nearby_stores: PostGIS distance search (replaces the legacy fake ±0.05° stores).
-- SECURITY INVOKER: RLS on stores applies.
-- -----------------------------------------------------------------------------
create function public.nearby_stores(
  p_lat         double precision,
  p_lng         double precision,
  p_radius_m    integer default 25000,
  p_merchant_id uuid default null
)
returns table (id uuid, name text, address_line text, city text, distance_m double precision)
language sql
stable
set search_path = ''
as $$
  select s.id, s.name, s.address_line, s.city,
         extensions.st_distance(
           s.location,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)
  from public.stores s
  where s.active
    and s.merchant_id = coalesce(p_merchant_id, private.default_merchant_id())
    and extensions.st_dwithin(
          s.location,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          least(greatest(p_radius_m, 1), 100000))
  order by 5
  limit 20;
$$;

-- -----------------------------------------------------------------------------
-- Grants: strip Postgres's implicit EXECUTE-to-PUBLIC (see foundation), then
-- allow-list. Revoking from PUBLIC leaves role-specific grants from 0500 intact.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public, private from public;

-- anon needs USAGE on `private` only to evaluate default_merchant_id() inside the
-- SECURITY INVOKER nearby_stores(); it holds EXECUTE on nothing else there.
grant usage on schema private to anon;
grant execute on function private.default_merchant_id() to anon, authenticated;

grant execute on function public.place_order(uuid, uuid, jsonb, integer, uuid) to authenticated;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated;
grant execute on function public.staff_award_points(text, bigint, uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_adjust(uuid, integer, text, uuid) to authenticated;
grant execute on function public.fulfill_order(uuid, text) to authenticated, service_role;
grant execute on function public.refund_order(uuid, text) to authenticated, service_role;
grant execute on function public.nearby_stores(double precision, double precision, integer, uuid)
  to anon, authenticated;

grant execute on function
  public.place_order(uuid, uuid, jsonb, integer, uuid),
  public.redeem_reward(uuid, uuid),
  public.staff_award_points(text, bigint, uuid, uuid, uuid),
  public.admin_adjust(uuid, integer, text, uuid)
to service_role;
