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

Separately, each signed-in user may call the routes at most 6 times a minute (POST) and 30 times a minute (GET, for polling), per server process. This protects the database; it isn't the spend control. The limit is held in memory per process: if the API ever runs on more than one instance, move it to a shared store (or the host's edge rate limiting) first.

A background run that takes longer than 5 minutes is closed as an error, well before the 10-minute release, so another request for that pin can't start while it's still running.

**Global cap trade-off.** The global daily cap (default 50) is shared by everyone, so ten collectors using their 5 each can use it up for the day. Spend stays bounded either way. If that happens often, raise `MARKET_PRICE_REQUEST_GLOBAL_DAILY` (each request costs at most 2 credits), lower the per-user cap, or watch `market_price_requests` for accounts that hit their cap every day.

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

## Batch pricing: `scripts/market-price-batch.mjs`

The question is whether to price every 2025–26 pin up front: **18,608 pins**. The batch script does it in capped runs, through the same request path as **Get a price** (`startPriceRequest()` with `origin: "batch"`). It runs on your machine, against **staging only** (the staging guard refuses anything else), like `market-refresh.mjs`.

**Which pins.** By default: verified, non-archived pins with `release_year` 2025 or 2026, in PinHunt ID order.
- `--years 2026` changes the years.
- `--ids-file top-pins.txt` gives your own list instead (one PinHunt ID per line, priced in that order). Use it for the "most collected first" stage.
- `--offset N --limit N` takes a slice.

**What it protects.**
- **Dry run by default.** It prints:
  - how many pins match, and how many were already answered;
  - the worst case for all of them;
  - what this run would spend under `--max-credits`, with a rough dollar cost;
  - the month's budget.

  It calls nothing.
- **`--apply` needs both:**
  - `--max-credits N`: the run's ceiling, at most 10,000;
  - `--confirm-credits` equal to the planned figure the dry run printed.

  It refuses if the month's budget isn't a hard stop, or if the plan is more than what's left after `MARKET_PRICE_REQUEST_BUDGET_RESERVE` (the same reserve collectors' requests keep) and `--leave-credits` (extra credits this run leaves, for example for collectors).
- **No double spending.** A pin with a finished answer, priced or "no sales", within `--cache-days` (default 180) is skipped for free. So is a pin a collector is requesting right now. **Re-running the same command resumes**: only unanswered pins are paid for.
- **Stops early, keeping what it got,** when:
  - the next pin's worst case would pass the ceiling;
  - the monthly budget or the kill switch stops Soldgraph;
  - the request path becomes unavailable;
  - there are 5 failures in a row (`--stop-after-errors`).
- **No collector caps.** Batch requests skip the per-user and global daily caps, but nothing else. Each pin is logged in `market_price_requests` with `origin = 'batch'`, and every credit is reserved against the monthly cap as usual.
- **Markets come from `MARKET_VALUATION_PUBLISHED_MARKETS`,** exactly as for a collector's request: `UK`, `US` or `UK,US`, only markets that passed the pilot. Set it on the command line (as below) or in your staging env file. With no UK or US market listed, the script refuses to plan. The batch never widens that list and keeps the configured reserve: it skips only the collector daily caps. It doesn't need `MARKET_PRICE_REQUEST_ENABLED` (that's the collector button).
- **`--ids-file` pins get the same filters:** only verified, non-archived pins are priced.
- **Output is counts only:** priced, no sales, already answered, running elsewhere, failed, credits spent, and the budget after. It prints a progress line every 25 pins.

**Commands** (from `artifacts/api-server`):
```
# 1. Plan (free)
MARKET_VALUATION_PUBLISHED_MARKETS=UK,US node --env-file=.env.staging scripts/market-price-batch.mjs --max-credits 1000

# 2. Run, with the planned figure from step 1
SOLDGRAPH_ENABLED=true MARKET_VALUATION_V2_ENABLED=true MARKET_VALUATION_PUBLISHED_MARKETS=UK,US \
  node --env-file=.env.staging scripts/market-price-batch.mjs --max-credits 1000 --apply --confirm-credits 1000

# Most-collected pins first, from your own list
MARKET_VALUATION_PUBLISHED_MARKETS=UK,US node --env-file=.env.staging scripts/market-price-batch.mjs --ids-file top-pins.txt --max-credits 1000
```
Exit code 0 means it finished or reached the ceiling; 2 means it stopped early (budget, errors or unavailable); 1 means it was refused.

**Collector cache vs batch cache.** A collector's request is answered from the cache for `MARKET_PRICE_REQUEST_CACHE_DAYS` (default 30). If you batch-price with `--cache-days 180`, raise that setting on the API host to match. Otherwise a collector tapping **Get a price** on a pin the batch answered 31–180 days ago pays for it again.

**Production.** The script is staging-only, like the pilot. Running it against production needs a deliberate production mode with its own guard. That isn't built yet; ask for it once the staging runs look right.

**What it costs.**

| | UK only | UK + US |
|---|---|---|
| Worst case | 18,608 credits | **37,216 credits** |
| At $0.0045/credit (the $9 / 2,000 plan) | ≈ $84 | ≈ $167 |
| Months at 2,000 credits/month | ≈ 9.3 | ≈ 18.6 |

The worst case is also the likely case. A search that finds nothing still costs its credit, and many 2025–26 pins will have few or no sales yet. The dry run prints the exact numbers for your catalogue.

**Suggested approach.** Do it in stages, each with a hard ceiling, and look at the hit rate (priced vs no sales) after each:
1. the pilot above (about 50 credits);
2. the 500 pins most often in collections or on ISO lists, with `--ids-file` (about 1,000 credits);
3. then decide on the rest.

To reach all 18,608 pins in a month or two, a larger Soldgraph plan would be needed; check its per-credit price first. Re-pricing later works the same way: the batch only pays for pins whose answer is older than `--cache-days`.
