-- =============================================================================
-- Auth wiring, RLS predicate helpers, policies, and explicit grants.
--
-- Authorization decisions read `merchant_staff` live (via SECURITY DEFINER
-- helpers) rather than trusting JWT claims, so revoking a staff member takes
-- effect immediately instead of at token expiry. The `merchant_roles` claim
-- added by the access-token hook is for UI routing only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Predicate helpers (STABLE, SECURITY DEFINER to avoid recursive RLS)
-- -----------------------------------------------------------------------------

create function private.has_merchant_role(
  p_merchant_id uuid,
  p_roles public.staff_role[] default array['owner', 'admin', 'cashier']::public.staff_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant_staff s
    where s.merchant_id = p_merchant_id
      and s.user_id = (select auth.uid())
      and s.role = any (p_roles));
$$;

create function private.owns_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.loyalty_accounts a
    where a.id = p_account_id and a.user_id = (select auth.uid()));
$$;

-- Owner of the account, or any staff member of the account's merchant.
create function private.can_read_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.loyalty_accounts a
    where a.id = p_account_id
      and (a.user_id = (select auth.uid())
           or exists (select 1 from public.merchant_staff s
                      where s.merchant_id = a.merchant_id
                        and s.user_id = (select auth.uid()))));
$$;

-- Staff may read profiles of customers enrolled at their merchant.
create function private.is_staff_for_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loyalty_accounts a
    join public.merchant_staff s on s.merchant_id = a.merchant_id
    where a.user_id = p_user_id and s.user_id = (select auth.uid()));
$$;

-- Customer ledger accounts: their owner. Any ledger account: merchant owner/admin.
create function private.can_read_ledger_account(p_ledger_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ledger_accounts la
    left join public.loyalty_accounts a on a.id = la.loyalty_account_id
    where la.id = p_ledger_account_id
      and (a.user_id = (select auth.uid())
           or private.has_merchant_role(la.merchant_id,
                array['owner', 'admin']::public.staff_role[])));
$$;

revoke execute on all functions in schema private from public;
grant execute on function
  private.has_merchant_role(uuid, public.staff_role[]),
  private.owns_account(uuid),
  private.can_read_account(uuid),
  private.is_staff_for_user(uuid),
  private.can_read_ledger_account(uuid),
  private.try_uuid(text)
to authenticated;

-- -----------------------------------------------------------------------------
-- New-user trigger: profile + enrolment in the default merchant + signup bonus.
-- One transaction with the auth.users insert: either everything exists or the
-- signup fails.
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_phone    text;
  v_referrer uuid;
  v_merchant uuid;
begin
  -- User metadata is client-controlled: sanitise rather than let a CHECK abort signup.
  v_phone := nullif(regexp_replace(coalesce(v_meta ->> 'phone', ''), '[^0-9+ ]', '', 'g'), '');
  if v_phone is not null and v_phone !~ '^\+?[0-9 ]{7,20}$' then
    v_phone := null;
  end if;

  select p.id into v_referrer
  from public.profiles p
  where p.referral_code = upper(nullif(trim(v_meta ->> 'referral_code'), ''));

  insert into public.profiles (id, first_name, last_name, phone, referred_by)
  values (
    new.id,
    left(nullif(trim(v_meta ->> 'first_name'), ''), 80),
    left(nullif(trim(v_meta ->> 'last_name'), ''), 80),
    v_phone,
    v_referrer);

  select m.id into v_merchant from public.merchants m where m.is_default and m.active;
  if v_merchant is not null then
    perform private.enroll_account(new.id, v_merchant);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Custom Access Token Hook: adds `merchant_roles: { "<merchant_id>": "<role>" }`.
-- Enabled in config.toml ([auth.hook.custom_access_token]); in hosted projects
-- enable it under Authentication > Hooks.
-- -----------------------------------------------------------------------------
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_roles  jsonb;
begin
  select coalesce(jsonb_object_agg(s.merchant_id::text, s.role), '{}'::jsonb)
    into v_roles
  from public.merchant_staff s
  where s.user_id = (event ->> 'user_id')::uuid;

  v_claims := jsonb_set(v_claims, '{merchant_roles}', v_roles);
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- -----------------------------------------------------------------------------
-- Table privileges (allow-list; RLS narrows rows further)
-- -----------------------------------------------------------------------------
grant select on public.merchants, public.tiers, public.stores, public.products, public.rewards
  to anon, authenticated;

grant select on
  public.profiles, public.merchant_staff, public.loyalty_accounts, public.cart_items,
  public.orders, public.order_items, public.reward_redemptions,
  public.ledger_accounts, public.ledger_transactions, public.ledger_entries,
  public.point_balances, public.point_lots
to authenticated;

-- Customer writes
grant insert, update, delete on public.cart_items to authenticated;
grant update (first_name, last_name, phone, avatar_path) on public.profiles to authenticated;

-- Merchant admin writes (RLS restricts to staff with the right role)
grant insert, update, delete on public.products, public.rewards, public.stores, public.tiers
  to authenticated;
grant insert, update, delete on public.merchant_staff to authenticated;
grant update (name, earn_rate_bps, point_value_paise, max_redeem_bps,
              signup_bonus_points, point_expiry_days, active)
  on public.merchants to authenticated;

-- Ledger, balances, orders, redemptions: NO write grants to client roles at all.
-- They change only through SECURITY DEFINER RPCs.

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.merchants           enable row level security;
alter table public.profiles            enable row level security;
alter table public.merchant_staff      enable row level security;
alter table public.tiers               enable row level security;
alter table public.loyalty_accounts    enable row level security;
alter table public.stores              enable row level security;
alter table public.products            enable row level security;
alter table public.rewards             enable row level security;
alter table public.cart_items          enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.reward_redemptions  enable row level security;
alter table public.ledger_accounts     enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries      enable row level security;
alter table public.point_balances      enable row level security;
alter table public.point_lots          enable row level security;

-- merchants
create policy "merchants: public read active" on public.merchants
  for select to anon, authenticated using (active);
create policy "merchants: staff read" on public.merchants
  for select to authenticated using (private.has_merchant_role(id));
create policy "merchants: owner update" on public.merchants
  for update to authenticated
  using (private.has_merchant_role(id, array['owner']::public.staff_role[]))
  with check (private.has_merchant_role(id, array['owner']::public.staff_role[]));

-- profiles
create policy "profiles: self or merchant staff read" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.is_staff_for_user(id));
create policy "profiles: self update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- merchant_staff
create policy "merchant_staff: self or admin read" on public.merchant_staff
  for select to authenticated
  using (user_id = (select auth.uid())
         or private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "merchant_staff: owner insert" on public.merchant_staff
  for insert to authenticated
  with check (private.has_merchant_role(merchant_id, array['owner']::public.staff_role[]));
create policy "merchant_staff: owner update" on public.merchant_staff
  for update to authenticated
  using (private.has_merchant_role(merchant_id, array['owner']::public.staff_role[]))
  with check (private.has_merchant_role(merchant_id, array['owner']::public.staff_role[]));
create policy "merchant_staff: owner delete" on public.merchant_staff
  for delete to authenticated
  using (private.has_merchant_role(merchant_id, array['owner']::public.staff_role[]));

-- tiers (public read; owner/admin manage)
create policy "tiers: public read" on public.tiers
  for select to anon, authenticated using (true);
create policy "tiers: admin insert" on public.tiers
  for insert to authenticated
  with check (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "tiers: admin update" on public.tiers
  for update to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]))
  with check (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "tiers: admin delete" on public.tiers
  for delete to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));

-- loyalty_accounts (read only)
create policy "loyalty_accounts: owner or staff read" on public.loyalty_accounts
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_merchant_role(merchant_id));

-- stores / products / rewards: anon sees active; staff also see inactive; owner/admin manage.
create policy "stores: anon read active" on public.stores
  for select to anon using (active);
create policy "stores: read" on public.stores
  for select to authenticated using (active or private.has_merchant_role(merchant_id));
create policy "stores: admin insert" on public.stores
  for insert to authenticated
  with check (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "stores: admin update" on public.stores
  for update to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]))
  with check (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "stores: admin delete" on public.stores
  for delete to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));

create policy "products: anon read active" on public.products
  for select to anon using (active);
create policy "products: read" on public.products
  for select to authenticated using (active or private.has_merchant_role(merchant_id));
create policy "products: admin insert" on public.products
  for insert to authenticated
  with check (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "products: admin update" on public.products
  for update to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]))
  with check (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "products: admin delete" on public.products
  for delete to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));

create policy "rewards: anon read active" on public.rewards
  for select to anon using (active);
create policy "rewards: read" on public.rewards
  for select to authenticated using (active or private.has_merchant_role(merchant_id));
create policy "rewards: admin insert" on public.rewards
  for insert to authenticated
  with check (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "rewards: admin update" on public.rewards
  for update to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]))
  with check (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
create policy "rewards: admin delete" on public.rewards
  for delete to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));

-- cart_items: full CRUD on own cart only.
create policy "cart_items: owner select" on public.cart_items
  for select to authenticated using (private.owns_account(account_id));
create policy "cart_items: owner insert" on public.cart_items
  for insert to authenticated with check (private.owns_account(account_id));
create policy "cart_items: owner update" on public.cart_items
  for update to authenticated
  using (private.owns_account(account_id)) with check (private.owns_account(account_id));
create policy "cart_items: owner delete" on public.cart_items
  for delete to authenticated using (private.owns_account(account_id));

-- orders / order_items / redemptions: SELECT only.
create policy "orders: owner or staff read" on public.orders
  for select to authenticated
  using (private.owns_account(account_id) or private.has_merchant_role(merchant_id));
create policy "order_items: via visible order" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy "reward_redemptions: owner or staff read" on public.reward_redemptions
  for select to authenticated
  using (private.owns_account(account_id) or private.has_merchant_role(merchant_id));

-- ledger: SELECT only. Customers see their own legs, never the counter-account legs.
create policy "ledger_accounts: read" on public.ledger_accounts
  for select to authenticated using (private.can_read_ledger_account(id));
create policy "ledger_entries: read" on public.ledger_entries
  for select to authenticated using (private.can_read_ledger_account(ledger_account_id));
create policy "ledger_transactions: read" on public.ledger_transactions
  for select to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[])
         or exists (select 1 from public.ledger_entries e
                    where e.txn_id = ledger_transactions.id
                      and private.can_read_ledger_account(e.ledger_account_id)));
create policy "point_balances: owner or staff read" on public.point_balances
  for select to authenticated using (private.can_read_account(loyalty_account_id));
create policy "point_lots: owner or staff read" on public.point_lots
  for select to authenticated using (private.can_read_account(loyalty_account_id));
