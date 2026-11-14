-- =============================================================================
-- Commerce: stores (PostGIS), catalog, rewards, cart, orders, redemptions.
-- Money is integer paise everywhere. Composite (merchant_id, x) foreign keys
-- make cross-tenant references structurally impossible.
-- =============================================================================

create table public.stores (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  name         text not null check (length(name) between 1 and 120),
  address_line text not null,
  city         text not null,
  postal_code  text,
  phone        text,
  location     extensions.geography(point, 4326) not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (merchant_id, id)
);
create index stores_location_gix on public.stores using gist (location);
create index stores_merchant_idx on public.stores (merchant_id) where active;
create trigger stores_touch before update on public.stores
  for each row execute function private.touch_updated_at();

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references public.merchants (id) on delete cascade,
  sku              text not null check (sku ~ '^[A-Z0-9-]{3,40}$'),
  name             text not null check (length(name) between 1 and 200),
  short_name       text check (length(short_name) <= 60),
  description      text,
  category         text not null default 'general',
  specs            jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),
  list_price_paise bigint not null check (list_price_paise > 0),
  sale_price_paise bigint not null check (sale_price_paise > 0),
  image_path       text,  -- object path inside the `product-images` bucket
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint products_sale_not_above_list check (sale_price_paise <= list_price_paise),
  unique (merchant_id, sku),
  unique (merchant_id, id)
);
create index products_catalog_idx on public.products (merchant_id, category) where active;
create trigger products_touch before update on public.products
  for each row execute function private.touch_updated_at();

create table public.rewards (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  product_id  uuid,
  name        text not null check (length(name) between 1 and 120),
  description text,
  image_path  text,
  points_cost integer not null check (points_cost > 0),
  stock       integer check (stock is null or stock >= 0),  -- null = unlimited
  active      boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rewards_window check (ends_at is null or starts_at is null or ends_at > starts_at),
  unique (merchant_id, id),
  foreign key (merchant_id, product_id) references public.products (merchant_id, id)
    on delete set null (product_id)
);
create index rewards_catalog_idx on public.rewards (merchant_id) where active;
create index rewards_product_idx on public.rewards (product_id);
create trigger rewards_touch before update on public.rewards
  for each row execute function private.touch_updated_at();

-- The only customer-writable table. Prices are deliberately NOT stored here:
-- place_order() always re-prices from `products`.
create table public.cart_items (
  merchant_id uuid not null,
  account_id  uuid not null,
  product_id  uuid not null,
  qty         integer not null check (qty between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (account_id, product_id),
  foreign key (merchant_id, account_id) references public.loyalty_accounts (merchant_id, id)
    on delete cascade,
  foreign key (merchant_id, product_id) references public.products (merchant_id, id)
    on delete cascade
);
create index cart_items_product_idx on public.cart_items (product_id);
create trigger cart_items_touch before update on public.cart_items
  for each row execute function private.touch_updated_at();

create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  merchant_id           uuid not null,
  account_id            uuid not null,
  store_id              uuid,
  status                public.order_status not null default 'pending',
  subtotal_paise        bigint not null check (subtotal_paise >= 0),
  points_redeemed       integer not null default 0 check (points_redeemed >= 0),
  points_discount_paise bigint not null default 0 check (points_discount_paise >= 0),
  total_paise           bigint not null check (total_paise >= 0),
  points_earned         integer not null default 0 check (points_earned >= 0),
  shipping_address      jsonb check (shipping_address is null or jsonb_typeof(shipping_address) = 'object'),
  payment_ref           text,
  idempotency_key       uuid not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  fulfilled_at          timestamptz,
  cancelled_at          timestamptz,
  refunded_at           timestamptz,
  constraint orders_total_math check (total_paise = subtotal_paise - points_discount_paise),
  constraint orders_fulfilment_target check (store_id is not null or shipping_address is not null),
  unique (account_id, idempotency_key),
  unique (merchant_id, payment_ref),
  foreign key (merchant_id, account_id) references public.loyalty_accounts (merchant_id, id)
    on delete restrict,
  foreign key (merchant_id, store_id) references public.stores (merchant_id, id)
    on delete restrict
);
create index orders_account_idx on public.orders (account_id, created_at desc);
create index orders_merchant_status_idx on public.orders (merchant_id, status, created_at desc);
create index orders_store_idx on public.orders (store_id);
create trigger orders_touch before update on public.orders
  for each row execute function private.touch_updated_at();

create table public.order_items (
  id               bigint generated always as identity primary key,
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid references public.products (id) on delete set null,
  name_snapshot    text not null,
  list_price_paise bigint not null check (list_price_paise > 0),
  unit_price_paise bigint not null check (unit_price_paise > 0),
  qty              integer not null check (qty > 0),
  line_total_paise bigint generated always as (unit_price_paise * qty) stored
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.reward_redemptions (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null,
  account_id      uuid not null,
  reward_id       uuid not null,
  points_spent    integer not null check (points_spent > 0),
  status          public.redemption_status not null default 'issued',
  -- Bearer voucher code shown to the customer; CSPRNG-backed.
  code            text not null unique default private.random_code(12),
  idempotency_key uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (account_id, idempotency_key),
  foreign key (merchant_id, account_id) references public.loyalty_accounts (merchant_id, id)
    on delete restrict,
  foreign key (merchant_id, reward_id) references public.rewards (merchant_id, id)
    on delete restrict
);
create index reward_redemptions_account_idx on public.reward_redemptions (account_id, created_at desc);
create index reward_redemptions_reward_idx on public.reward_redemptions (reward_id);
create trigger reward_redemptions_touch before update on public.reward_redemptions
  for each row execute function private.touch_updated_at();
