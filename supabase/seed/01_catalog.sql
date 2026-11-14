-- =============================================================================
-- Catalog bootstrap: default merchant, tiers, stores, the 19 legacy products and
-- starter rewards. No users, no credentials.
--
-- Local: loaded automatically by `supabase db reset` (see [db.seed] in config.toml).
-- Production: run ONCE after the first `supabase db push` (see DEPLOYMENT.md),
-- then manage the catalog from /staff/catalog. Refuses to run twice.
--
-- Catalog is ported from loyaltyapp/client/services/data.js (19 products).
-- Data corrections applied (deterministic rules, see supabase/storage/README.md):
--   R1 sale price < 10% of list on phones => dropped digit, x10
--        #9  Honor 6      ₹15,000 / ₹1,100  -> ₹15,000 / ₹11,000   (the reported typo)
--        #12 OnePlus 3    ₹16,000 / ₹1,200  -> ₹16,000 / ₹12,000
--        #13 OnePlus 6    ₹13,500 / ₹1,200  -> ₹13,500 / ₹12,000
--        #15 OnePlus 2    ₹18,000 / ₹1,200  -> ₹18,000 / ₹12,000
--   R2 sale > list => swapped
--        #11 Honor 5      ₹1,300 / ₹1,400   -> ₹1,400 / ₹1,300
--   R3 backpack specs copy-pasted onto non-backpack items => cleared (#16-#19)
--   R4 duplicate image files de-duplicated (phone_4 -> phone_3, phone_5 -> iphone_1)
-- Flagged for a human (left as-is): #10 ₹1,400/₹1,200 and #14 ₹15,400/₹3,200 phone
-- prices; #16-#19 ₹1,500/₹1,200 iPhone & gold bar prices; image/name mismatches on
-- #11, #12, #13, #18.
-- =============================================================================

-- Fixed merchant id so storage paths (<merchant>/products/...) and tests match.
--   merchant  b0000000-0000-4000-8000-000000000001

do $$
begin
  if exists (select 1 from public.merchants where id = 'b0000000-0000-4000-8000-000000000001') then
    raise exception 'catalog already loaded: refusing to insert duplicates';
  end if;
end $$;

insert into public.merchants (id, slug, name, is_default, point_expiry_days)
values ('b0000000-0000-4000-8000-000000000001', 'demo', 'Loyalty Demo Store', true, 365);

insert into public.tiers (merchant_id, name, min_lifetime_points, multiplier_bps) values
  ('b0000000-0000-4000-8000-000000000001', 'Silver',       0, 10000),
  ('b0000000-0000-4000-8000-000000000001', 'Gold',      2000, 12500),
  ('b0000000-0000-4000-8000-000000000001', 'Platinum', 10000, 15000);

insert into public.stores (merchant_id, name, address_line, city, postal_code, phone, location) values
  ('b0000000-0000-4000-8000-000000000001', 'Indiranagar', '100 Feet Road, HAL 2nd Stage',
   'Bengaluru', '560038', '+91 80 4000 1001',
   extensions.st_setsrid(extensions.st_makepoint(77.6408, 12.9719), 4326)::extensions.geography),
  ('b0000000-0000-4000-8000-000000000001', 'Koramangala', '80 Feet Road, 4th Block',
   'Bengaluru', '560034', '+91 80 4000 1002',
   extensions.st_setsrid(extensions.st_makepoint(77.6271, 12.9352), 4326)::extensions.geography),
  ('b0000000-0000-4000-8000-000000000001', 'Whitefield', 'ITPL Main Road, Pattandur Agrahara',
   'Bengaluru', '560066', '+91 80 4000 1003',
   extensions.st_setsrid(extensions.st_makepoint(77.7499, 12.9698), 4326)::extensions.geography);

-- ---------------------------------------------------------------------------
-- Products (prices in paise). image_path is relative to the product-images bucket.
-- ---------------------------------------------------------------------------
with
  m as (select 'b0000000-0000-4000-8000-000000000001'::uuid as id),
  bag_specs as (select jsonb_build_array(
    'Outer Material: Nylon, Color: Blue',
    'Capacity: 42 liters; Weight: 830 grams',
    'Dimensions: 53 cms x 20.5 cms x 34.5 cms (LxWxH)',
    'Number of compartments: 3',
    'Warranty type: Manufacturer; 12 Months international') as v),
  phone_specs as (select jsonb_build_array(
    'Camera: 20+16 MP Dual rear camera with Optical image stabilization, Super slow motion, Portrait mode | 16 MP front camera',
    'Display: 15.95 centimeters (6.28-inch) Full HD+ Optic AMOLED display with 2280x1080 pixels and 19:9 aspect ratio | 2.5D Corning Gorilla Glass 5',
    'Memory, Storage & SIM: 6GB RAM | 64GB storage | Dual nano SIM with dual standby (4G+4G)',
    'Operating System and Processor: Android Oreo 8.1 Oxygen operating system based on with Qualcomm Snapdragon 845 octa core processor',
    'Battery: 3300 mAH lithium Polymer battery with Dash Charge technology') as v),
  catalog (sku, name, short_name, category, list_paise, sale_paise, file, spec_kind) as (values
    ('LGC-001', 'F Gear Luxur Laptop Backpack',  'Luxur Backpack',  'bags', 150000, 120000, 'bag_1.png', 'bag'),
    ('LGC-002', 'F Gear Arthur Laptop Backpack', 'Arthur Backpack', 'bags', 150000, 120000, 'bag_2.png', 'bag'),
    ('LGC-003', 'F Gear Flex Laptop Backpack',   'Flex Backpack',   'bags', 150000, 120000, 'bag_3.png', 'bag'),
    ('LGC-004', 'F Gear Crist Laptop Backpack',  'Crist Backpack',  'bags', 150000, 120000, 'bag_4.png', 'bag'),
    ('LGC-005', 'F Gear Reebok Laptop Backpack', 'Reebok Backpack', 'bags', 150000, 120000, 'bag_5.png', 'bag'),
    ('LGC-006', 'F Gear Tesla Laptop Backpack',  'Tesla Backpack',  'bags', 150000, 120000, 'bag_6.png', 'bag'),
    ('LGC-007', 'F Gear Carvan Laptop Backpack', 'Carvan Backpack', 'bags', 150000, 120000, 'bag_7.png', 'bag'),
    ('LGC-008', 'F Gear Luxur Laptop Backpack',  'Luxur Backpack',  'bags', 150000, 120000, 'bag_8.png', 'bag'),
    ('LGC-009', 'Honor 6 (Mirror Black, 6GB RAM, 64GB Storage)',   'Honor 6',   'phones', 1500000, 1100000, 'phone_1.jpg', 'phone'),
    ('LGC-010', 'OnePlus 6 (Mirror Black, 6GB RAM, 64GB Storage)', 'OnePlus 6', 'phones',  140000,  120000, 'phone_2.jpg', 'phone'),
    ('LGC-011', 'Honor 5 (Mirror Black, 6GB RAM, 64GB Storage)',   'Honor 5',   'phones',  140000,  130000, 'phone_3.jpg', 'phone'),
    ('LGC-012', 'OnePlus 3 (Mirror Black, 6GB RAM, 64GB Storage)', 'OnePlus 3', 'phones', 1600000, 1200000, 'phone_3.jpg', 'phone'),
    ('LGC-013', 'OnePlus 6 (Mirror Black, 6GB RAM, 64GB Storage)', 'OnePlus 6', 'phones', 1350000, 1200000, 'iphone_1.jpg', 'phone'),
    ('LGC-014', 'OnePlus 6 (Mirror Black, 6GB RAM, 64GB Storage)', 'OnePlus 6', 'phones', 1540000,  320000, 'phone_6.jpg', 'phone'),
    ('LGC-015', 'OnePlus 2 (Mirror Black, 6GB RAM, 64GB Storage)', 'OnePlus 2', 'phones', 1800000, 1200000, 'phone_7.jpg', 'phone'),
    ('LGC-016', 'iPhone 6', 'iPhone 6', 'featured', 150000, 120000, 'iphone_1.jpg',  'none'),
    ('LGC-017', 'Gold Bar', 'Gold Bar', 'featured', 150000, 120000, 'gold_1.jpg',    'none'),
    ('LGC-018', 'iPhone 3', 'iPhone 3', 'featured', 150000, 120000, 'oneplus_1.jpg', 'none'),
    ('LGC-019', 'Gold Bar', 'Gold Bar', 'featured', 150000, 120000, 'gold_2.jpg',    'none')
  )
insert into public.products
  (merchant_id, sku, name, short_name, category, specs, list_price_paise, sale_price_paise, image_path)
select
  m.id, r.sku, r.name, r.short_name, r.category,
  case r.spec_kind when 'bag' then bag_specs.v when 'phone' then phone_specs.v else '[]'::jsonb end,
  r.list_paise, r.sale_paise,
  m.id || '/products/' || r.file
from catalog r, m, bag_specs, phone_specs;

-- ---------------------------------------------------------------------------
-- Rewards (1 point = ₹0.25 at the default point_value_paise of 25)
-- ---------------------------------------------------------------------------
insert into public.rewards (merchant_id, product_id, name, description, points_cost, stock, active, starts_at, ends_at)
select 'b0000000-0000-4000-8000-000000000001'::uuid, r.product_id, r.name, r.description,
       r.points_cost, r.stock, r.active, r.starts_at, r.ends_at
from (values
  (null::uuid, 'Free gift wrap', 'Gift wrapping on your next order.', 150, 100, true, null::timestamptz, null::timestamptz),
  (null::uuid, '₹100 off voucher', 'Flat ₹100 off any order above ₹999.', 400, null, true, null, null),
  ((select id from public.products where sku = 'LGC-001'),
   'Luxur Laptop Backpack', 'Redeem the F Gear Luxur backpack outright.', 4800, 5, true, null, null),
  (null::uuid, 'Launch week double voucher', 'Expired promotion kept for history.', 300, null, true,
   '2026-01-01T00:00:00Z'::timestamptz, '2026-01-08T00:00:00Z'::timestamptz)
) as r(product_id, name, description, points_cost, stock, active, starts_at, ends_at);
