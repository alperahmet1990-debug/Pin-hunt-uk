# Marketplace leads for catalogue research (#415)

`scripts/marketplace-leads.mjs` looks at the marketplace listings the market refresh already stored (`scripts/MARKET-REFRESH.md`) and turns the "near misses" into research leads: pins that may be missing from the catalogue, variants (jumbo, chaser, artist proof and so on), possible sets, and edition size, edition type or release year checks on pins we already have. It writes a standard research-run file that you load through **Admin → Research Review → Load research run**, like any other research run.

It runs on your own laptop, against **staging** only: the staging guard refuses anything else.

## What it does, and what it never does

**Does:**
- Reads stored near misses (listings the refresh rejected only because of a different variant, edition or year) from the last **180 days** that haven't expired.
- Ignores bundles, lots, job lots, boxed sets and multi-pin listings, and anything the catalogue already has.
- Groups the rest. A lead needs **3 or more listings, or listings from 2 or more sites** (eBay UK and eBay FR count as two). A single listing is never a lead.
- Gives each lead a score from 0 to 100 (number of listings, number of sites, how recent, how well the titles agree). 60 or more is **Low** confidence, below 60 is **Unverified**. Nothing is ever Medium or High.
- Prints counts only.

**Never:**
- Calls Soldgraph or any other paid API, unless you ask for the set probe (below) **and** confirm its cost.
- Writes to the database. It reads `market_sources`, `market_listings`, `pins` and `pin_sets`; nothing else.
- Writes to `pins` or `pin_sets`, or publishes anything. Leads go into Research Review like any research run, and the existing rules apply:
  - Marketplace evidence is lead-only (stored as `unclassified`). It never counts as verification.
  - A lead can't be approved as it stands (Low or Unverified confidence). Research it from an official or news source first.
  - Edition and year checks point at the existing pin, so they show as a conflict and can never be imported. Change an existing pin only through the audited field-change path.
- Puts listing titles, seller names, descriptions, images or listing links in the file. Each lead has only short title words seen in most of its listings, well-known character names, a series guess, edition size and type, year and variant word. Each evidence row says which sites, how many listings, the date range, the median price and the lead score, plus a reference (`mkt-…`) instead of a link.
- Prints your keys, listing titles or links.

## Before you start

- The market refresh has run on staging at least once (so there are stored listings), with migration 049 applied.
- `artifacts/api-server/.env.staging` as for `MARKET-REFRESH.md`. The Soldgraph key is only needed for the set probe.
- Run every command from `artifacts/api-server`.

## 1. See what it would find (report only)

```
node --env-file=.env.staging scripts/marketplace-leads.mjs
```

It prints how many listings it read and ignored, how many are already in the catalogue, and how many leads of each kind it found. Nothing is written anywhere.

Options:
- `--window-days 90`: only listings from the last 90 days (default 180).
- `--min-listings 4`, `--min-marketplaces 3`: a stricter lead threshold (defaults 3 and 2; the lowest allowed is 2).
- `--sources soldgraph:ebay_gb_sold,soldgraph:ebay_fr_sold`: only listings from these sources.

## 2. Write the research-run file

Pick a file **outside the repository** (the script refuses a path inside it, and refuses to overwrite a file):
```
node --env-file=.env.staging scripts/marketplace-leads.mjs --out ~/pinhunt-leads/leads-2026-10-18.json
```

The file is checked with the same validation as the Research Review upload before it is written. If there are no leads, no file is written.

## 3. Load it

In the app, **Admin → Research Review → Load research run**, choose the file, check the preview counts and load it. The run shows as `marketplace-leads/1`.

Each lead's title is its research key, for example `marketplace-leads/discrepancy-edition-size/phuk-00000123-3000-1a2b3c`. The review reasons say what it is:
- `possible_missing_pin`, with `possible_set_member:<set>` and `set_gap:<known>/<expected>` when it looks like part of a set you have.
- `possible_variant_of:<PinHunt ID>` and `variant:<word>`, or `possible_base_of:<PinHunt ID>`.
- `discrepancy:edition_size`, `discrepancy:edition_type` or `discrepancy:release_year`, with the existing pin shown alongside.
- `possible_set`: a series name two or more missing-pin leads share that no catalogue set has.
- `lead_score:<0–100>`.

Treat each one as a pointer for research, not a fact: find an official or news source, then either run proper research for a new pin or correct the existing pin through the audited path. Reject or mark "needs more research" with a short note when it's noise.

## Optional: probe sets that have gaps (costs credits)

Off by default. It searches for up to 3 catalogue sets (`pin_sets`) that have fewer pins than expected, one search per set per source, through the market refresh's own Soldgraph client: the same kill switch, monthly budget (reserved one credit at a time) and adapters. Results stay in memory for that one run. They are never stored, so write the file in the same command.

Dry run (no call, prints the sets, the worst-case credits and the month's budget):
```
node --env-file=.env.staging scripts/marketplace-leads.mjs --probe-sets --probe-sources soldgraph:ebay_gb_sold
```

Then, using the worst case it printed:
```
SOLDGRAPH_ENABLED=true node --env-file=.env.staging scripts/marketplace-leads.mjs --probe-sets --probe-sources soldgraph:ebay_gb_sold --apply --confirm-credits 3 --out ~/pinhunt-leads/leads-probe-2026-10-18.json
```

It refuses if `--confirm-credits` isn't exactly the worst case, if that is more than the credits left this month, if the source isn't switched on in `market_sources`, or without `SOLDGRAPH_ENABLED=true`. `--max-probe-sets 5` searches up to 5 sets (at most 10). Every probe search comes out of the same 100-credit budget as the valuation pilot. Running it again searches again; there's no cache for set searches because there's no pin to store them against.

## Switching it off

There's nothing to switch off: it runs only when you run it. No schedule, no workflow and no route call it.
