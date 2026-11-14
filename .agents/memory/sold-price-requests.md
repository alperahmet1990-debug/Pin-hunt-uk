---
name: Sold-price requests ("Get a price")
description: How the on-demand eBay sold-price request (#611, PR #610) is wired and the decisions behind it.
---

- **Path:** app `SoldPriceCard` + `hooks/useSoldPrices.ts` → `POST/GET /api/pins/:pinId/price-request` → `services/market/price-request/service.ts` → `runRefresh` (unchanged search/match/store/revalue) for one pin, with `creditCeiling` instead of `--confirm-credits`. Values are read back through the existing `/market-valuations` route.
- **Decision point is SQL:** `claim_market_price_request()` (migration 079) does in-flight, cache (including `no_sales`), per-user (5/24h) and global (50/24h) caps under one advisory lock. The TS fake in `service.test.ts` mirrors it; `supabase/verify/079_verify.sql` checks the real one. Batch requests (`origin: "batch"`) skip the daily caps only.
- **Fails closed:** no service key → 503. Don't copy `usage-caps.ts` (fails open); this path spends paid credits. Requests also require a hard-stop monthly budget.
- **Flag off = 404 for everyone,** checked before `requireUser`. A per-user, per-process limit (6 POST / 30 GET a minute) runs before any planning; move it to a shared store before running more than one API instance.
- **Only published markets are searched** (UK → ebay_gb_sold, US → ebay_us_sold); FR is never searched (#411). `GET` returns those `markets`, and the tile words "Get a price" from them.
- **Background run:** POST returns 202; the run is closed as an error after 5 minutes, and from then on its Soldgraph client refuses new searches (`cancellableClient`). A pending row older than 10 minutes is released by the next claim.
- **Two caches stack:** the refresh's 7-day listing TTL (only when listings were found) and the request cache (30 days, also for empty results). Failed or stopped requests aren't cached but count towards the daily cap.
- **The budget reserve is best effort** (checked outside the lock); the monthly hard stop is exact. The global-cap 429 carries no `retryAfter` (it would reveal other users' timing).
- **No listings or links in the app** until LAUNCH-BLOCKERS L1 (eBay terms) is resolved.
- **Maintainer decisions (14 Nov 2026):** no account-age or anonymous-user restriction for now; reserve default stays 0.
- **Batch is designed, not built:** same entry point with `origin: "batch"`; see `artifacts/api-server/scripts/PRICE-REQUEST.md`.
- **Screenshots:** sold-price routes in `scripts/screenshot-routes.json` use the harness's `api` mocks and anchor on "Where it lives" (exists on main), so `--base origin/main` captures a real before.
