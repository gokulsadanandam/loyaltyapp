-- =============================================================================
-- Double-entry points ledger.
--
-- Invariants (all enforced in the database, not the app):
--   1. Every transaction's entries sum to zero      -> deferred constraint trigger
--   2. Entries/transactions are append-only         -> BEFORE UPDATE/DELETE/TRUNCATE triggers
--   3. A customer balance can never go negative     -> CHECK on point_balances
--   4. A posting is applied at most once            -> UNIQUE (merchant_id, idempotency_key)
--   5. Concurrent postings per customer serialise   -> SELECT ... FOR UPDATE on point_balances
--   6. sum(point_lots.remaining) = balance          -> maintained by private.post_points()
-- =============================================================================

create table public.ledger_accounts (
  id                 uuid primary key default gen_random_uuid(),
  merchant_id        uuid not null references public.merchants (id) on delete restrict,
  kind               public.ledger_account_kind not null,
  loyalty_account_id uuid unique,
  created_at         timestamptz not null default now(),
  constraint ledger_accounts_customer_link
    check ((kind = 'customer') = (loyalty_account_id is not null)),
  foreign key (merchant_id, loyalty_account_id)
    references public.loyalty_accounts (merchant_id, id) on delete restrict
);
create unique index ledger_accounts_one_system_account
  on public.ledger_accounts (merchant_id, kind) where kind <> 'customer';

create table public.ledger_transactions (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null references public.merchants (id) on delete restrict,
  kind            public.ledger_txn_kind not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  ref_type        text,
  ref_id          uuid,
  reason          text,
  actor_id        uuid,  -- auth.uid() at posting time; null = system / trusted backend
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (merchant_id, idempotency_key)
);
create index ledger_transactions_ref_idx on public.ledger_transactions (ref_type, ref_id);
create index ledger_transactions_merchant_idx on public.ledger_transactions (merchant_id, created_at desc);

create table public.ledger_entries (
  id                bigint generated always as identity primary key,
  txn_id            uuid not null references public.ledger_transactions (id) on delete restrict,
  ledger_account_id uuid not null references public.ledger_accounts (id) on delete restrict,
  amount            bigint not null check (amount <> 0),
  created_at        timestamptz not null default now(),
  unique (txn_id, ledger_account_id)
);
create index ledger_entries_account_idx on public.ledger_entries (ledger_account_id, created_at desc);

create table public.point_balances (
  loyalty_account_id uuid primary key references public.loyalty_accounts (id) on delete restrict,
  balance            bigint not null default 0,
  lifetime_earned    bigint not null default 0,
  updated_at         timestamptz not null default now(),
  constraint point_balances_non_negative check (balance >= 0),
  constraint point_balances_lifetime_non_negative check (lifetime_earned >= 0)
);

-- Each credit creates a lot; debits consume lots oldest-expiry-first (FIFO).
create table public.point_lots (
  id                 uuid primary key default gen_random_uuid(),
  loyalty_account_id uuid not null references public.loyalty_accounts (id) on delete restrict,
  source_txn_id      uuid not null references public.ledger_transactions (id) on delete restrict,
  original           bigint not null check (original > 0),
  remaining          bigint not null check (remaining >= 0),
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),
  constraint point_lots_remaining_le_original check (remaining <= original)
);
create index point_lots_open_idx on public.point_lots (loyalty_account_id, expires_at, created_at)
  where remaining > 0;
create index point_lots_expiry_idx on public.point_lots (expires_at) where remaining > 0;
create index point_lots_source_idx on public.point_lots (source_txn_id);

-- -----------------------------------------------------------------------------
-- Invariant triggers
-- -----------------------------------------------------------------------------

create function private.ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ledger_is_append_only'
    using errcode = 'P0001',
          hint = 'Post a compensating transaction instead of mutating history.';
end;
$$;

create trigger ledger_entries_append_only
  before update or delete on public.ledger_entries
  for each row execute function private.ledger_append_only();
create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function private.ledger_append_only();
create trigger ledger_transactions_append_only
  before update or delete on public.ledger_transactions
  for each row execute function private.ledger_append_only();
create trigger ledger_transactions_no_truncate
  before truncate on public.ledger_transactions
  for each statement execute function private.ledger_append_only();

-- Entries may only touch ledger accounts of the transaction's merchant.
create function private.ledger_check_entry_merchant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.ledger_transactions t
    join public.ledger_accounts a on a.merchant_id = t.merchant_id
    where t.id = new.txn_id and a.id = new.ledger_account_id
  ) then
    raise exception 'ledger_cross_merchant_entry' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ledger_entries_merchant_check
  before insert on public.ledger_entries
  for each row execute function private.ledger_check_entry_merchant();

-- Zero-sum, checked at COMMIT so multi-leg transactions can be inserted row by row.
create function private.ledger_assert_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sum numeric;
begin
  select coalesce(sum(e.amount), 0) into v_sum
  from public.ledger_entries e
  where e.txn_id = new.txn_id;

  if v_sum <> 0 then
    raise exception 'ledger_unbalanced'
      using errcode = '23514',
            detail = format('transaction %s sums to %s', new.txn_id, v_sum);
  end if;
  return null;
end;
$$;

create constraint trigger ledger_entries_zero_sum
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.ledger_assert_balanced();

-- Apply customer legs to the materialised balance. The CHECK on point_balances
-- is the last line of defence against overdraft, independent of RPC logic.
create function private.ledger_apply_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_account uuid;
  v_kind    public.ledger_txn_kind;
begin
  select a.loyalty_account_id into v_account
  from public.ledger_accounts a
  where a.id = new.ledger_account_id;

  if v_account is null then
    return null;  -- system account leg
  end if;

  select t.kind into v_kind from public.ledger_transactions t where t.id = new.txn_id;

  update public.point_balances b
     set balance         = b.balance + new.amount,
         lifetime_earned = b.lifetime_earned
           + case when v_kind in ('signup', 'earn', 'earn_reversal', 'referral', 'migration')
                  then new.amount else 0 end,
         updated_at      = now()
   where b.loyalty_account_id = v_account;

  if not found then
    raise exception 'balance_row_missing' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create trigger ledger_entries_apply
  after insert on public.ledger_entries
  for each row execute function private.ledger_apply_entry();

-- Tier follows lifetime_earned (can move down after an earn reversal).
create function private.recalc_tier()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.loyalty_accounts a
     set tier_id = (
       select t.id
       from public.tiers t
       where t.merchant_id = a.merchant_id
         and t.min_lifetime_points <= new.lifetime_earned
       order by t.min_lifetime_points desc
       limit 1)
   where a.id = new.loyalty_account_id;
  return null;
end;
$$;

create trigger point_balances_recalc_tier
  after update of lifetime_earned on public.point_balances
  for each row
  when (old.lifetime_earned is distinct from new.lifetime_earned)
  execute function private.recalc_tier();

-- System ledger accounts are created with the merchant.
create function private.create_system_ledger_accounts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.ledger_accounts (merchant_id, kind)
  select new.id, k::public.ledger_account_kind
  from unnest(array['issued', 'redeemed', 'expired', 'adjustment']) as k;
  return null;
end;
$$;

create trigger merchants_system_ledger_accounts
  after insert on public.merchants
  for each row execute function private.create_system_ledger_accounts();

-- -----------------------------------------------------------------------------
-- Posting primitives (internal; never granted to client roles)
-- -----------------------------------------------------------------------------

-- FIFO lot consumption. Expired-but-not-yet-swept lots are NOT spendable.
create function private.consume_lots(p_account_id uuid, p_points bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_left bigint := p_points;
  v_take bigint;
  r      record;
begin
  for r in
    select l.id, l.remaining
    from public.point_lots l
    where l.loyalty_account_id = p_account_id
      and l.remaining > 0
      and (l.expires_at is null or l.expires_at > now())
    order by l.expires_at asc nulls last, l.created_at asc, l.id
    for update
  loop
    exit when v_left = 0;
    v_take := least(r.remaining, v_left);
    update public.point_lots set remaining = remaining - v_take where id = r.id;
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'insufficient_points'
      using errcode = 'P0001', detail = format('short by %s points', v_left);
  end if;
end;
$$;

-- Spendable points = non-expired lot remainder (can be < balance until expiry sweep runs).
create function private.available_points(p_account_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.remaining), 0)::bigint
  from public.point_lots l
  where l.loyalty_account_id = p_account_id
    and l.remaining > 0
    and (l.expires_at is null or l.expires_at > now());
$$;

-- The ONLY way points move. Two-legged: customer <-> the system account implied
-- by `p_kind`. Idempotent on (merchant, p_idempotency_key): a replay returns the
-- original transaction with was_created = false; a replay whose kind/ref differ
-- raises `idempotency_key_reused`.
create function private.post_points(
  p_account_id      uuid,
  p_kind            public.ledger_txn_kind,
  p_points          bigint,           -- signed, from the customer's perspective
  p_idempotency_key text,
  p_ref_type        text default null,
  p_ref_id          uuid default null,
  p_reason          text default null,
  p_metadata        jsonb default '{}'::jsonb,
  p_consume_lots    boolean default true,
  out posted_txn_id uuid,
  out was_created   boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant     uuid;
  v_expiry_days  integer;
  v_customer_la  uuid;
  v_counter_la   uuid;
  v_counter_kind public.ledger_account_kind;
  v_existing     public.ledger_transactions%rowtype;
begin
  if p_points is null or p_points = 0 then
    raise exception 'zero_amount' using errcode = 'P0001';
  end if;

  if (p_kind in ('signup', 'earn', 'referral', 'migration', 'redeem_reversal') and p_points < 0)
     or (p_kind in ('redeem', 'expire', 'earn_reversal') and p_points > 0) then
    raise exception 'invalid_sign_for_kind'
      using errcode = 'P0001', detail = format('%s cannot be %s', p_kind, p_points);
  end if;

  select a.merchant_id, m.point_expiry_days
    into v_merchant, v_expiry_days
  from public.loyalty_accounts a
  join public.merchants m on m.id = a.merchant_id
  where a.id = p_account_id;

  if v_merchant is null then
    raise exception 'account_not_found' using errcode = 'P0001';
  end if;

  -- Serialise every ledger write for this customer. Callers usually already hold
  -- this lock (row locks are re-entrant within a transaction).
  perform 1 from public.point_balances b where b.loyalty_account_id = p_account_id for update;

  insert into public.ledger_transactions
    (merchant_id, kind, idempotency_key, ref_type, ref_id, reason, actor_id, metadata)
  values
    (v_merchant, p_kind, p_idempotency_key, p_ref_type, p_ref_id, p_reason,
     auth.uid(), coalesce(p_metadata, '{}'::jsonb))
  on conflict (merchant_id, idempotency_key) do nothing
  returning id into posted_txn_id;

  if posted_txn_id is null then
    select * into v_existing
    from public.ledger_transactions t
    where t.merchant_id = v_merchant and t.idempotency_key = p_idempotency_key;

    if v_existing.kind <> p_kind or v_existing.ref_id is distinct from p_ref_id then
      raise exception 'idempotency_key_reused'
        using errcode = 'P0001', detail = format('key %s already used', p_idempotency_key);
    end if;

    posted_txn_id := v_existing.id;
    was_created := false;
    return;
  end if;
  was_created := true;

  v_counter_kind := case p_kind
    when 'redeem'          then 'redeemed'
    when 'redeem_reversal' then 'redeemed'
    when 'expire'          then 'expired'
    when 'adjust'          then 'adjustment'
    else 'issued'
  end::public.ledger_account_kind;

  select a.id into v_customer_la from public.ledger_accounts a where a.loyalty_account_id = p_account_id;
  select a.id into v_counter_la
  from public.ledger_accounts a
  where a.merchant_id = v_merchant and a.kind = v_counter_kind;

  if v_customer_la is null or v_counter_la is null then
    raise exception 'ledger_account_missing' using errcode = 'P0001';
  end if;

  -- Consume lots first so the caller gets a clean `insufficient_points`
  -- rather than a CHECK violation from point_balances.
  if p_points < 0 and p_consume_lots then
    perform private.consume_lots(p_account_id, -p_points);
  end if;

  insert into public.ledger_entries (txn_id, ledger_account_id, amount)
  values (posted_txn_id, v_customer_la, p_points),
         (posted_txn_id, v_counter_la, -p_points);

  if p_points > 0 then
    insert into public.point_lots (loyalty_account_id, source_txn_id, original, remaining, expires_at)
    values (p_account_id, posted_txn_id, p_points, p_points,
            case when v_expiry_days is not null
                 then now() + make_interval(days => v_expiry_days) end);
  end if;
end;
$$;

-- Enrol a user with a merchant: account + customer ledger account + balance row
-- + signup bonus, atomically. Safe to call twice.
create function private.enroll_account(p_user_id uuid, p_merchant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_bonus   integer;
begin
  insert into public.loyalty_accounts (merchant_id, user_id, tier_id)
  values (
    p_merchant_id,
    p_user_id,
    (select t.id from public.tiers t
      where t.merchant_id = p_merchant_id
      order by t.min_lifetime_points asc limit 1))
  on conflict (merchant_id, user_id) do nothing
  returning id into v_account;

  if v_account is null then
    select a.id into v_account
    from public.loyalty_accounts a
    where a.merchant_id = p_merchant_id and a.user_id = p_user_id;
    return v_account;
  end if;

  insert into public.ledger_accounts (merchant_id, kind, loyalty_account_id)
  values (p_merchant_id, 'customer', v_account);

  insert into public.point_balances (loyalty_account_id) values (v_account);

  select m.signup_bonus_points into v_bonus from public.merchants m where m.id = p_merchant_id;
  if v_bonus > 0 then
    perform private.post_points(
      v_account, 'signup', v_bonus, 'signup:' || v_account,
      'loyalty_account', v_account, 'Welcome bonus');
  end if;

  return v_account;
end;
$$;

-- Nightly sweep (schedule with pg_cron in hosted projects). Locks balance before
-- lot to match the lock order used by every other posting path.
create function private.expire_points()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r           record;
  v_remaining bigint;
  v_count     integer := 0;
begin
  for r in
    select l.id, l.loyalty_account_id
    from public.point_lots l
    where l.remaining > 0 and l.expires_at <= now()
    order by l.loyalty_account_id, l.expires_at
  loop
    perform 1 from public.point_balances b
      where b.loyalty_account_id = r.loyalty_account_id for update;

    -- Re-read under lock: a concurrent posting may have consumed the lot.
    select l.remaining into v_remaining
    from public.point_lots l
    where l.id = r.id
    for update;

    continue when v_remaining is null or v_remaining = 0;

    update public.point_lots set remaining = 0 where id = r.id;

    perform private.post_points(
      r.loyalty_account_id, 'expire', -v_remaining, 'expire:' || r.id,
      'point_lot', r.id, 'Points expired', '{}'::jsonb, false);

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
