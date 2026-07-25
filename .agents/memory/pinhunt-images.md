---
name: PinHunt catalogue images
description: Where pin images actually live (nowhere yet), placeholder behaviour, and stale flag caveat.
---
- As of Jan 2026 (post-13k import), **no catalogue pin has a real image**: `pins.image_url`/`back_image_url` are null for all rows, and `pin_images` is empty. Every pin in the app shows the same bundled placeholder via `getPinImageSource()` (gold Mickey pin asset) — a screenshot of a pin "with an image" is the placeholder.
- `needs_front_image`/`needs_back_image` flags are stale: false everywhere despite null URLs. Anything selecting "pins missing images" must filter on the actual `image_url` field, not the flags.
- eBay image dry-run infra (report-only): `ebay_image_dry_run_runs`/`_results` tables (migration 017), service `ebay-image-dryrun.ts`, admin endpoint `POST /api/catalogue/ebay-image-dry-run`, report screen `app/admin/ebay-image-dryrun.tsx`.
- **eBay match-scoring lesson:** many pins have generic names ("Hatbox Ghost") shared across many series — name overlap alone matches wrong pins. Require series/edition discriminator tokens (from `collection` + `edition_type`, minus generic words) when the pin name is ≤3 tokens; reject conflicting LE sizes outright. Also filter Browse API to `buyingOptions:{FIXED_PRICE}` — auction listings report current bid and skew valuations low. Sold-price data needs the restricted Marketplace Insights API.
