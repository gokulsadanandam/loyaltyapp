-- =============================================================================
-- LOCAL / CI ONLY: test accounts with known passwords. Never run in production.
--   customer@example.com / Password123   (customer, 100 signup points)
--   admin@example.com    / Password123   (merchant owner)
--   cashier@example.com  / Password123   (merchant cashier)
-- Requires 01_catalog.sql (the default merchant) to have run first.
-- =============================================================================
-- ---------------------------------------------------------------------------
-- Test users. Inserting into auth.users fires handle_new_user(), which creates
-- the profile, enrols in the default merchant, and posts the 100-point bonus.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'customer@example.com',
   extensions.crypt('Password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"first_name":"Asha","last_name":"Rao","phone":"+91 98450 00001"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'admin@example.com',
   extensions.crypt('Password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"first_name":"Dev","last_name":"Admin"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'cashier@example.com',
   extensions.crypt('Password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"first_name":"Kiran","last_name":"Cashier"}',
   now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002',
               'c0000000-0000-4000-8000-000000000003');

insert into public.merchant_staff (merchant_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'owner'),
       ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'cashier');

-- A starter cart for the customer so checkout can be exercised immediately.
insert into public.cart_items (merchant_id, account_id, product_id, qty)
select a.merchant_id, a.id, p.id, 1
from public.loyalty_accounts a
join public.products p on p.merchant_id = a.merchant_id and p.sku in ('LGC-002', 'LGC-017')
where a.user_id = 'c0000000-0000-4000-8000-000000000001';
