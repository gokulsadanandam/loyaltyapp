-- =============================================================================
-- Core: merchants, profiles, staff, tiers, loyalty accounts.
-- Multi-tenant ready (every customer-facing row is merchant-scoped) but the
-- product ships with one `is_default` merchant.
-- =============================================================================

create table public.merchants (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name                text not null check (length(name) between 1 and 120),
  currency            char(3) not null default 'INR',
  -- Points earned per rupee = earn_rate_bps / 10000 (1000 = 10%, the legacy offers.js:25 rate).
  earn_rate_bps       integer not null default 1000 check (earn_rate_bps between 0 and 10000),
  -- Rupee value of one point when redeemed at checkout, in paise.
  point_value_paise   integer not null default 25 check (point_value_paise > 0),
  -- Max share of an order's subtotal payable with points.
  max_redeem_bps      integer not null default 5000 check (max_redeem_bps between 0 and 10000),
  signup_bonus_points integer not null default 100 check (signup_bonus_points >= 0),
  point_expiry_days   integer check (point_expiry_days is null or point_expiry_days > 0),
  is_default          boolean not null default false,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index merchants_single_default on public.merchants (is_default) where is_default;
create trigger merchants_touch before update on public.merchants
  for each row execute function private.touch_updated_at();

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  first_name    text check (length(first_name) <= 80),
  last_name     text check (length(last_name) <= 80),
  phone         text check (phone ~ '^\+?[0-9 ]{7,20}$'),
  avatar_path   text check (length(avatar_path) <= 300),
  -- Public identifier printed on the member QR card (replaces legacy `loyaltytracker`).
  member_code   text not null unique default ('LY' || private.random_code(10)),
  referral_code text not null unique default private.random_code(8),
  referred_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_no_self_referral check (referred_by is null or referred_by <> id)
);
create index profiles_referred_by_idx on public.profiles (referred_by);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create table public.merchant_staff (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.staff_role not null,
  created_at  timestamptz not null default now(),
  primary key (merchant_id, user_id)
);
create index merchant_staff_user_idx on public.merchant_staff (user_id);

create table public.tiers (
  id                  uuid primary key default gen_random_uuid(),
  merchant_id         uuid not null references public.merchants (id) on delete cascade,
  name                text not null check (length(name) between 1 and 40),
  min_lifetime_points bigint not null check (min_lifetime_points >= 0),
  -- Earn multiplier in basis points (10000 = 1.0x).
  multiplier_bps      integer not null default 10000 check (multiplier_bps between 10000 and 50000),
  created_at          timestamptz not null default now(),
  unique (merchant_id, name),
  unique (merchant_id, min_lifetime_points),
  unique (merchant_id, id)
);

create table public.loyalty_accounts (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  user_id     uuid not null references auth.users (id) on delete cascade,
  tier_id     uuid,
  created_at  timestamptz not null default now(),
  unique (merchant_id, user_id),
  unique (merchant_id, id),
  -- Composite FK guarantees the tier belongs to the same merchant.
  foreign key (merchant_id, tier_id) references public.tiers (merchant_id, id)
    on delete set null (tier_id)
);
create index loyalty_accounts_user_idx on public.loyalty_accounts (user_id);
create index loyalty_accounts_tier_idx on public.loyalty_accounts (tier_id);
