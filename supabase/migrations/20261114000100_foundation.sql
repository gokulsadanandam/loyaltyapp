-- =============================================================================
-- Foundation: extensions, private schema, enums, shared helpers, and a
-- deny-by-default privilege posture.
-- =============================================================================

create extension if not exists postgis with schema extensions;

-- `private` holds helpers and SECURITY DEFINER internals. It is NOT listed in
-- [api].schemas, so PostgREST never exposes it. `authenticated` gets USAGE only
-- so RLS policies can call the predicate helpers we explicitly grant below.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Deny by default. Supabase's stock default privileges grant ALL on every new
-- public table/function to anon + authenticated and rely on RLS alone. We revoke
-- that so every grant in later migrations is an explicit allow-list entry.
--
-- Caveat: Postgres itself grants EXECUTE on every new function to PUBLIC, and a
-- schema-scoped default (`... in schema x revoke ... from public`) cannot remove
-- that global default. So each migration that creates functions must end its
-- grant section with `revoke execute on all functions in schema ... from public`.
-- tests/database/02_write_protection pins the resulting allow-list.
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;
alter default privileges for role postgres in schema private
  revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.staff_role as enum ('owner', 'admin', 'cashier');

create type public.order_status as enum ('pending', 'fulfilled', 'cancelled', 'refunded');

create type public.redemption_status as enum ('issued', 'fulfilled', 'cancelled');

create type public.ledger_account_kind as enum (
  'customer',    -- one per loyalty account
  'issued',      -- source of all newly minted points (balance = -outstanding liability minted)
  'redeemed',    -- sink for spent points
  'expired',     -- sink for expired points
  'adjustment'   -- counterparty for manual admin corrections
);

create type public.ledger_txn_kind as enum (
  'signup', 'earn', 'earn_reversal', 'redeem', 'redeem_reversal',
  'expire', 'adjust', 'referral', 'migration'
);

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Human-friendly random code (no 0/O/1/I). Entropy comes from gen_random_uuid(),
-- which is backed by a CSPRNG; byte 0 of a v4 UUID is fully random and 256 % 32 = 0,
-- so the alphabet index is unbiased.
create function private.random_code(p_len integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
           substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
                  1 + (get_byte(uuid_send(gen_random_uuid()), 0) % 32), 1),
           '')
  from generate_series(1, p_len);
$$;

-- Safe text -> uuid cast for storage path parsing (returns null instead of raising).
create function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
