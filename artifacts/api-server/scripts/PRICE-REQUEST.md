# "Get a price": on-demand eBay sold prices

Collectors see a **Recent sold prices** tile on the pin page. It shows their home market first (UK £ or US $), with low, fair and high values and "Based on N recent sales". The other market is one tap away. When a pin has no sold price yet, a **Get a price** button asks the API server to check recent eBay sales for that one pin.

Everything is **off by default**. With the switches off, the tile doesn't appear and the pin page looks exactly as it does today. The existing asking-price section stays, labelled as asking prices.

- API: `POST /api/pins/:pinId/price-request` and `GET /api/pins/:pinId/price-request` (`src/routes/price-request.ts`, `src/services/market/price-request/`).
- App: `components/SoldPriceCard.tsx` and `hooks/useSoldPrices.ts`.
- Database: migration `079_market_price_requests.sql`, the request log and its locked claim function.

## What one request does

1. **Checks the switches.** The request flag, valuation v2 and the Soldgraph kill switch and key must all be on. At least one published market must have an eBay sold source.
   - UK uses `soldgraph:ebay_gb_sold`; US uses `soldgraph:ebay_us_sold`.
   - FR is never searched.
   - A market that isn't in `MARKET_VALUATION_PUBLISHED_MARKETS` is never paid for, because nobody could see the result.
2. **Plans the refresh for that one pin.** This uses the same code as `market-refresh.mjs`: domestic sellers only, matching, near-miss storage and revaluation. It works out:
   - the worst case, which is at most **2 credits** (UK + US);
   - **0 credits** when the pin's listings are still inside the refresh's own 7-day cache.

   It is refused unless the month's budget is a **hard stop** and the worst case fits in what's left, minus `MARKET_PRICE_REQUEST_BUDGET_RESERVE`.
3. **Claims the request in one locked database step** (`claim_market_price_request`):
   - **Already running for this pin** → refused (the app shows "Checking…").
   - **Answered within the cache window** (default 30 days), **including "no sales found"** → that answer is returned, with no new search.
   - **Collector's daily cap** (default 5 per rolling 24h) → refused with a retry time.
   - **Global daily cap** (default 50 per rolling 24h) → refused.
4. **Runs the search in the background.** The app polls until it finishes. Every credit is still reserved against the monthly cap in the database, one at a time.
5. **Closes the request with counts only:**
   - `priced` or `no_sales`: both are cached;
   - `stopped` (budget or kill switch) or `error`: not cached, so the pin can be asked again. These still count towards the collector's daily cap, so a failing pin can't drain credits.

A stuck request (for example after a server restart) is released after 10 minutes. Each search has a 60-second deadline in the Soldgraph client, so a live request finishes well inside that window.

Separately, each signed-in user may call the routes at most 6 times a minute (POST) and 30 times a minute (GET, for polling), per server process. This protects the database; it isn't the spend control.

## Before turning it on: re-run the pilot (staging, small, budget-capped)

The values aren't proven yet:
- #411 found UK results mixed with international sales, and FR "sold" prices that were converted UK sales.
- The domestic-filter fix (#450) hasn't been re-checked.
- US sold prices have never been piloted.

Do this on **staging** with `scripts/market-refresh.mjs` (walkthrough: `MARKET-REFRESH.md`). It costs about **52 credits**.

1. **Set a hard budget for the month** on staging (SQL editor). Use 60 credits, so the pilot can't spend more:
   ```sql
   insert into provider_budgets (provider, month, limit_credits, hard_stop)
   values ('soldgraph', '2026-11', 60, true)
   on conflict (provider, month) do update set limit_credits = 60, hard_stop = true, updated_at = now();
   update market_sources set enabled = true, updated_at = now()
   where id in ('soldgraph:ebay_gb_sold', 'soldgraph:ebay_us_sold');
   ```
2. **Probe each site once** (1 credit each):
   ```
   SOLDGRAPH_ENABLED=true node --env-file=.env.staging scripts/market-refresh.mjs probe --pinhunt-id PHUK-... --source soldgraph:ebay_gb_sold --apply --confirm-credits 1
   SOLDGRAPH_ENABLED=true node --env-file=.env.staging scripts/market-refresh.mjs probe --pinhunt-id PHUK-... --source soldgraph:ebay_us_sold --apply --confirm-credits 1
   ```
   - Check the `Source` line says `item_location=domestic`.
   - Check `Item country` shows only `GB` (or `US`) and `unknown`. Any other country means the filter isn't working: stop, and post the counts on #450.
3. **Pick 25 pins you can check by hand.** Use a mix:
   - popular pins, rare LEs and open editions;
   - a few Paris pins;
   - a few that you expect have no sales.

   Put them in `pilot-pins.txt`, then dry-run and run:
   ```
   node --env-file=.env.staging scripts/market-refresh.mjs --ids-file pilot-pins.txt --sources soldgraph:ebay_gb_sold,soldgraph:ebay_us_sold
   SOLDGRAPH_ENABLED=true MARKET_VALUATION_V2_ENABLED=true node --env-file=.env.staging scripts/market-refresh.mjs --ids-file pilot-pins.txt --sources soldgraph:ebay_gb_sold,soldgraph:ebay_us_sold --apply --confirm-credits 50
   ```
4. **Spot-check what was matched** (staging SQL editor; this is your own data, nothing leaves Supabase):
   ```sql
   select p.pinhunt_id, l.source_id, l.title, l.price, l.currency, l.item_country, l.sold_date, l.listing_url
   from market_listings l join pins p on p.id = l.pin_id
   where l.accepted and l.source_id in ('soldgraph:ebay_gb_sold', 'soldgraph:ebay_us_sold')
   order by random() limit 40;

   select p.pinhunt_id, v.market, v.low, v.fair, v.high, v.sold_count, v.confidence_band
   from market_valuations v join pins p on p.id = v.pin_id
   where v.market in ('UK', 'US') order by p.pinhunt_id, v.market;
   ```

### What "good enough to publish" looks like

Judge each market separately. A market is ready when **all** of these hold:

| Check | Bar |
|---|---|
| Region | Every accepted row has `item_country` = that market's country or `unknown`. No converted prices. The probe's country counts look the same. |
| Right pin | In 40 random accepted rows, **at most 2** are a different pin, variant or edition. |
| Price is believable | For 10 pins you check by hand on that eBay site's sold search (domestic sellers), the fair value is within about **±25%** of what you'd say it sells for. |
| No double counting | No eBay item counted in both UK and US (the refresh's `left out: cross_market_duplicate` handles this; spot-check two or three). |
| Coverage | Report how many of the 25 got a value. There's no pass mark, but it tells you how often "No recent sales found" will appear, and what the batch would buy. |

Record the result on #411 for UK and on a new note for US. Update `docs/market-data/RIGHTS.md` §6. Then add that market, and only that market, to `MARKET_VALUATION_PUBLISHED_MARKETS`. If US fails, publish `UK` alone: requests then search and spend on UK only (1 credit).

## Checklist: apply, set, verify

**Migrations (never applied by an agent; staging first, then production as a separate step).**

1. **Check which ones staging already has.** In the SQL editor:
   ```sql
   select to_regclass('public.market_listings') as m049,
          (select count(*) from information_schema.columns where table_name = 'market_listings' and column_name = 'location_filter') as m054,
          to_regclass('public.market_valuation_history') as m055,
          to_regclass('public.market_price_requests') as m079;
   ```
2. **Apply any missing ones on staging, in order** (049 → 054 → 055 → 079). Run each file from `supabase/migrations/`, then its check script: `supabase/verify/049_verify.sql`, `054_verify.sql`, `055_verify.sql`, `079_verify.sql`. Each must end with its "ALL … CHECKS PASSED" row. Then run `notify pgrst, 'reload schema';`.
3. **Production:** the same four, in the same order, with the same verify scripts. Do this only after the staging pilot above has passed for at least one market.
   - Production has no backups yet (LAUNCH-BLOCKERS T12). All four migrations are additive, but take a manual export first anyway.

**Database settings (production, SQL editor).**
- Set a hard budget for the month (`provider_budgets`, `hard_stop = true`). Requests refuse to run without a hard stop.
- Enable the sources you publish: `update market_sources set enabled = true where id in ('soldgraph:ebay_gb_sold'[, 'soldgraph:ebay_us_sold']);`

**API host environment (Render; you set these, never committed).**

| Variable | Value |
|---|---|
| `SOLDGRAPH_API_KEY` | your production key (set it only on the host) |
| `SOLDGRAPH_ENABLED` | `true` |
| `MARKET_VALUATION_V2_ENABLED` | `true` |
| `MARKET_VALUATION_PUBLISHED_MARKETS` | `UK` or `UK,US`: only markets that passed the pilot |
| `MARKET_PRICE_REQUEST_ENABLED` | `true` |
| `MARKET_PRICE_REQUEST_USER_DAILY` | optional, default `5` |
| `MARKET_PRICE_REQUEST_GLOBAL_DAILY` | optional, default `50` (about 100 credits a day at most) |
| `MARKET_PRICE_REQUEST_CACHE_DAYS` | optional, default `30` |
| `MARKET_PRICE_REQUEST_BUDGET_RESERVE` | optional, credits requests leave for you, default `0`. Best effort: parallel requests can dip into it by a few credits. The monthly hard stop itself is exact. |
| `MARKET_COMPS_PUBLIC_ENABLED` | **leave off** (LAUNCH-BLOCKERS L1) |

To switch it all off: set `MARKET_PRICE_REQUEST_ENABLED=false`, which hides the button. Set `MARKET_VALUATION_V2_ENABLED=false` as well to hide the whole tile. `SOLDGRAPH_ENABLED=false` stops every paid call at once.

**How to check it works (staging first).**
1. Signed in on a staging build, open a pin with no value. The tile shows **Get a price**. Tap it: it shows "Checking recent sales…", then a price or "No recent sales found".
2. Tap it again from another account: the answer comes back at once, without a new search. In SQL:
   ```sql
   select status, outcome, sold_counts, credits_spent, created_at, finished_at
   from market_price_requests order by created_at desc limit 10;
   ```
   It should show one row per real search.
3. Run `node --env-file=.env.staging scripts/market-usage.mjs`. Credits should go up by at most 2 per row with `credits_spent > 0`.
4. Make 6 requests on different pins from one account: the 6th says "You've used today's price checks".
5. Set the month's `limit_credits` to the current used amount. The next request says "Price checks aren't available right now", and usage doesn't move.

## Later: a capped batch (designed, not built)

The question is whether to price every 2025–26 pin up front: **18,608 pins**.

**How it would work.** A maintainer script would call the same `startPriceRequest()` with `origin: "batch"` for an explicit list of pins, one or two at a time, awaiting each `done`. It would share all of the request path's protections:
- **Spend control.** It prints the worst case and needs `--confirm-credits`, like `market-refresh.mjs`. A run ceiling (for example `--max-credits 2000`) stops it before the month's hard stop. `MARKET_PRICE_REQUEST_BUDGET_RESERVE` keeps credits back for collectors' requests.
- **No double spending.** A pin answered recently by anyone, whether priced or "no sales", is skipped through the same cache. Any pin a collector is already requesting is skipped as in flight. So the batch is **resumable**: re-running the same list only pays for pins not yet done.
- **No collector caps.** Batch requests skip the per-user and global daily caps, but nothing else. They're logged with `origin = 'batch'`.
- **Missing pieces to build:** the script itself, and a longer cache window for batch answers (for example 180 days), so collectors don't re-buy what the batch just bought.

**What it would cost.**

| | UK only | UK + US |
|---|---|---|
| Worst case | 18,608 credits | **37,216 credits** |
| At $0.0045/credit (the $9 / 2,000 plan) | ≈ $84 | ≈ $167 |
| Months at 2,000 credits/month | ≈ 9.3 | ≈ 18.6 |

The worst case is also the likely case. A search that finds nothing still costs its credit, and many 2025–26 pins will have few or no sales yet.

**Suggested approach.** Do it in stages, each with a hard ceiling, and look at the hit rate after each:
1. the pilot above (50 credits);
2. the 500 pins most often in collections or on ISO lists (≈1,000 credits);
3. then decide on the rest.

To reach all 18,608 pins in a month or two, a larger Soldgraph plan would be needed; check its per-credit price first. Re-pricing later works the same way: the batch only pays for pins whose answer has expired.
