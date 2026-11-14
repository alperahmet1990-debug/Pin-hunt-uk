---
name: Sold-price requests ("Get a price")
description: How the on-demand eBay sold-price request is wired and the decisions behind it.
---

- **Path:** app `SoldPriceCard` → `POST/GET /api/pins/:pinId/price-request` → `services/market/price-request/service.ts` → `runRefresh` (unchanged search/match/store/revalue) for one pin with `creditCeiling` instead of `--confirm-credits`. Values are read back through the existing `/market-valuations` route.
- **Decision point is SQL:** `claim_market_price_request()` (migration 079) does in-flight, cache (including `no_sales`), per-user and global daily caps under one advisory lock. The TS fake in `service.test.ts` mirrors it; `supabase/verify/079_verify.sql` checks the real one.
- **Fails closed:** no service key → 503. Don't copy `usage-caps.ts` (fails open); this path spends paid credits.
- **Only published markets are searched** (UK → ebay_gb_sold, US → ebay_us_sold). FR is never searched (#411).
- **Two caches stack:** the refresh's 7-day listing TTL (only when listings were found) and the request cache (30 days, also for empty results).
- **No listings or links in the app** until LAUNCH-BLOCKERS L1 (eBay terms) is resolved.
- **Batch is designed, not built:** same entry point with `origin: "batch"`; see `artifacts/api-server/scripts/PRICE-REQUEST.md`.
