# Storage seed assets

`supabase db reset` uploads everything under `product-images/` to the
`product-images` bucket (see `[storage.buckets.product-images]` in `config.toml`).
Object paths are `<merchant_id>/products/<file>`; the bucket's write policy keys
off the first path segment.

## Provenance

Copied from `loyaltyapp/client/images/`. Only catalog images were migrated; legacy
UI chrome (`cart.png`, `info.png`, `logout.png`, `save.png`, `flush.jpeg`,
`payment.jpg`, `settings.png`, `profile.jpg`, `uploadimage.png`, `offer*.{jpg,PNG}`,
`bag_6.jpg`, `bag_8.jpg`, `loyalty-*.png`) was intentionally left behind.

Duplicates removed (byte-identical, verified by MD5):

| Dropped       | Kept           | Used by        |
| ------------- | -------------- | -------------- |
| `phone_4.jpg` | `phone_3.jpg`  | LGC-011, LGC-012 |
| `phone_5.jpg` | `iphone_1.jpg` | LGC-013, LGC-016 |

## Catalog issues still needing a human

| SKU     | Issue |
| ------- | ----- |
| LGC-010 | ₹1,400 / ₹1,200 for a OnePlus 6: likely missing a digit, but not below the 10% rule threshold |
| LGC-014 | ₹15,400 / ₹3,200: 79% discount; ambiguous typo |
| LGC-016–019 | iPhones and gold bars at ₹1,500 / ₹1,200 (copied from the backpack rows) |
| LGC-011 | Named "Honor 5"; image is an Honor 7X |
| LGC-012 | Named "OnePlus 3"; image is the same Honor 7X |
| LGC-013 | Named "OnePlus 6"; image is an iPhone |
| LGC-018 | Named "iPhone 3"; image is a OnePlus 6 |
| LGC-001/008 | Identical names ("F Gear Luxur Laptop Backpack") with different images |
