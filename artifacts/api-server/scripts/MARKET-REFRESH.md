# Soldgraph market refresh pilot (#409)

`scripts/market-refresh.mjs` searches Soldgraph for a short list of pins, stores the matching listings, and works out each pin's UK / FR / US value (valuation v2). `scripts/market-usage.mjs` shows how many credits have been used. Both run on your own laptop, against **staging** only: the staging guard refuses anything else.

Nothing here is shown in the app. The values go into `market_valuations`; the listings stay in `market_listings`, which only the server can read.

## What it does, and what it never does

**Does:**
- Searches only the pins you list (at most 50) and the sources you name. There is no "refresh everything" option.
- Before any search, prints the **worst-case credit cost** and how many credits are **left this month**.
- Reuses what it already has. If a pin already has listings from a source that were seen recently, it doesn't search that source again: **7 days** for sold listings, **2 days** for current listings (change with `--sold-ttl-days` / `--active-ttl-days`). Soldgraph charges for its own cached results too, so this is where the saving is.
- Runs an identical search only once, even if two pins would make it.
- Stores matched listings, plus "near misses" (same pin but a different variant, year or edition size) for catalogue research. Unrelated listings are not stored. No images, no seller details, no location text: for eBay sold listings only the **country** worked out from the location is kept.
- Searches eBay sold listings for **domestic sellers only** (`item_location=domestic`) and only counts those as evidence for that market. See "Region" below.
- Keeps each listing only as long as the source's `retention_days` allows (30 days by default). `purge` deletes anything older.
- If the same listing matches two pins, keeps it against the better match only.
- Recalculates the value of each pin it searched.

**Never:**
- Runs without `--apply`. Without it, it only reads and prints.
- Spends more than the number you confirm with `--confirm-credits`, or more than the month's budget. The budget is also enforced in the database, one credit at a time.
- Writes to the catalogue, `pins.estimated_value_gbp`, collections or the v1 eBay estimates.
- Prints your keys, listing titles, links or seller data.

## Before you start

- Node 22.18 or newer, and `pnpm install` done in the repo.
- Migrations 049 and 054 applied on staging (054 adds the region columns; without it, saving listings fails).
- `artifacts/api-server/.env.staging` set up as for `staging:import-catalogue`, plus the Soldgraph key (the same value as on the staging Render service):
  ```
  SOLDGRAPH_API_KEY=...
  ```
  Never commit this file or paste its values anywhere. Don't put `SOLDGRAPH_ENABLED=true` in it: you switch Soldgraph on per command instead (below), so it stays off by default.
- Run every command from `artifacts/api-server`.

### Set the month's budget (optional)

Without a row, the budget is 100 credits a month (or `SOLDGRAPH_MONTHLY_LIMIT`), with a hard stop. To set it explicitly, run this in the staging SQL editor (change the month):

```sql
insert into provider_budgets (provider, month, limit_credits, hard_stop)
values ('soldgraph', '2026-10', 100, true)
on conflict (provider, month) do update set limit_credits = excluded.limit_credits, hard_stop = true, updated_at = now();
```

### Switch on the sources you want to try

All sources start disabled. In the staging SQL editor, for example for eBay UK and France sold listings:

```sql
update market_sources set enabled = true, updated_at = now()
where id in ('soldgraph:ebay_gb_sold', 'soldgraph:ebay_fr_sold');
```

The sources are `soldgraph:ebay_gb_sold`, `soldgraph:ebay_fr_sold`, `soldgraph:ebay_us_sold`, `soldgraph:vinted_gb_active`, `soldgraph:vinted_fr_active` and `soldgraph:whatnot_us_active`.

## 1. Check Soldgraph's field names with one search (1 credit)

The route and field names in the code are our best reading of Soldgraph's docs. Check them with a single search before the pilot.

Dry run (no call):
```
node --env-file=.env.staging scripts/market-refresh.mjs probe --pinhunt-id PHUK-00000001 --source soldgraph:ebay_gb_sold
```

It prints the route, the search text and the budget. Then run it for real:
```
SOLDGRAPH_ENABLED=true node --env-file=.env.staging scripts/market-refresh.mjs probe --pinhunt-id PHUK-00000001 --source soldgraph:ebay_gb_sold --apply --confirm-credits 1
```

It prints only the **names and types** of the fields Soldgraph returned (no values), how many rows our code could read, and how many matched the pin. It also prints the key names of Soldgraph's response (no values), so an empty search can be told apart from listings sitting where the code doesn't look.

The `Source` line shows the filter sent, for example `country=uk, item_location=domestic`. For eBay sold sources it also prints `Item country (parsed from location, counts only)`, for example `GB 30, unknown 6`. With the domestic filter, anything other than the site's country (GB for UK, FR for France, US for the US) or `unknown` means the filter isn't doing what we expect: post the counts on #450.

If it finds 0 rows, the pin's title may be too specific. Try a shorter search with `--query "..."` added to the same command (still 1 credit), for example `--query "disney hatbox ghost pin"`. Paste that output into issue #409 or #411. If it says "Soldgraph request failed (status 404 ...)", the route name is wrong; nothing was charged for a failed search. Either way, stop there and let the agent fix the names.

## 2. Plan the pilot (dry run)

Put the pilot pins in a text file, one PinHunt ID per line (lines starting with `#` are ignored), then:
```
node --env-file=.env.staging scripts/market-refresh.mjs --ids-file pilot-pins.txt --sources soldgraph:ebay_gb_sold,soldgraph:ebay_fr_sold
```
or list them: `--pinhunt-ids PHUK-00000001,PHUK-00000002`.

It prints the filter each source sends (for example `soldgraph:ebay_gb_sold: item_location=domestic`), for each pin how many searches it would make and which sources are still fresh, then:
- `Worst case: N credit(s)`: the most this run can spend.
- `Month 2026-10: X of 100 credits used ..., Y left`.
- Anything that would stop `--apply` (a source not switched on, over budget, and so on).

By default it makes **1 search per source per pin**. `--queries-per-source 2` (or 3) tries more wording, at up to 2 (or 3) times the cost.

With 100 credits a month: 1 for the probe, then for example 25 pins × UK sold = 25, and the same 25 × France sold = 25.

## 3. Run the pilot

Use the worst case from step 2:
```
SOLDGRAPH_ENABLED=true MARKET_VALUATION_V2_ENABLED=true node --env-file=.env.staging scripts/market-refresh.mjs --ids-file pilot-pins.txt --sources soldgraph:ebay_gb_sold,soldgraph:ebay_fr_sold --apply --confirm-credits 50
```

It refuses if `--confirm-credits` isn't exactly the worst case, or if that is more than what's left. It ends with one line per pin (searches, matches, near misses, and the value per market with its confidence), the credits it actually used, and the budget after.

If Soldgraph stops it part way (budget reached, quota, or the switch is off), it says "Stopped early"; everything found up to then is kept, and the remaining pins are untouched. Without `MARKET_VALUATION_V2_ENABLED=true` the listings are stored but no values are written.

Running the same command again within 7 days costs nothing for pins that already have sold listings: they're reused. (A search that found **nothing** usable leaves nothing to reuse, so it is searched again next time; the dry run shows it as planned.) eBay sold listings stored **without** the domestic filter (everything from before #450) are never reused this way, so those pins are searched again.

### Region: domestic sellers only (#450)

Soldgraph's `country` chooses the eBay **website** (ebay.co.uk, ebay.fr, ebay.com), not where the seller is. Without a filter, the UK and France searches returned the same international sales, with the France price converted to euros. So:

- Every eBay sold search sends `item_location=domestic`: sellers in that website's country only. The value per website is `EBAY_SOLD_ITEM_LOCATION` in `src/services/market/adapters/soldgraph-ebay-sold.ts` (`worldwide`, or no filter, are possible but those rows never count as regional evidence).
- Each stored row records the website searched, the filter sent, the displayed currency and the item's country (worked out from the location text; the text itself is not kept).
- A sale counts towards a market's value only if it was fetched with the domestic filter and its country, when known, is that market's. The value line per pin then says what was left out and why, for example `UK fair 12.15 GBP (low, 2 sold, 0 listed) (left out: region_unverified 3)`:
  - `region_unverified`: fetched without the domestic filter (all listings from before #450), or the item's country is another country.
  - `cross_market_duplicate`: the same eBay item counted for more than one market. It counts once, in the market matching its country; if its country is unknown, in none.
  - `converted_price`: Soldgraph says the price was converted (it has no such field today, so this doesn't happen yet).
- Nothing is deleted for this: the listings stay until they expire as usual.

## 4. Check usage

```
node --env-file=.env.staging scripts/market-usage.mjs
node --env-file=.env.staging scripts/market-usage.mjs --months 6 --usd-per-credit 0.0045
```

Credits and calls per month and Soldgraph route, the budget, and what's left. `--usd-per-credit` adds a rough cost (0.0045 is the $9 / 2,000 plan).

## Delete old listings

Dry run, then delete:
```
node --env-file=.env.staging scripts/market-refresh.mjs purge
node --env-file=.env.staging scripts/market-refresh.mjs purge --apply
```
`--source soldgraph:ebay_gb_sold` limits it to one source. It deletes rows past their expiry, or older than the source's current `retention_days` (so shortening `retention_days` takes effect at the next purge).

To delete **every** stored listing from a source (for example if the Soldgraph plan ends), run this in the SQL editor:
```sql
select purge_market_listings('soldgraph:ebay_gb_sold', true);
```

## Switching it all off

- Soldgraph is off unless you put `SOLDGRAPH_ENABLED=true` in front of a command. The staging Render service keeps `SOLDGRAPH_ENABLED=false`.
- To switch a source off: `update market_sources set enabled = false where id = '...';`.

## Scheduled refresh: off

There is no scheduled refresh. Nothing runs on a timer, and no workflow or cron job exists for this. After the pilot, if you want one, it would be a separate ticket that you approve, and would run this same script with a fixed pin list (never the whole catalogue), the same caps, and the cache, so a weekly run only pays for listings older than the TTL.
