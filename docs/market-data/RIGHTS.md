# Market data: rights, retention and provenance

This is the single record of what PinHunt may do with marketplace price data, and why. It keeps two things apart:
- **Soldgraph's own terms**, which govern PinHunt's use of the Soldgraph service and its data.
- **Marketplace terms** (eBay, Vinted, Whatnot), which Soldgraph cannot grant.

Code paths, flags and tickets that rely on a statement here link back to it.

Last updated: 21 Oct 2026 (maintainer).

## 1. Soldgraph: confirmed in writing

On 21 Oct 2026 the maintainer received **written confirmation directly from Soldgraph** covering PinHunt's intended use. The correspondence is held by the maintainer and is not stored in this repository.

| Use | Status |
|---|---|
| Publicly display individual sold listings: price, sold date and the original marketplace link | **Confirmed by Soldgraph** |
| Calculate and publish our own valuations, ranges, confidence scores and comparable-sale counts | **Confirmed by Soldgraph** |
| Keep historical sale records and metadata with no retention limit and no deletion requirement | **Confirmed by Soldgraph** |
| Attribution to Soldgraph | **Optional** (Soldgraph does not require it) |
| Rights in the underlying marketplace data | **Not granted by Soldgraph.** Soldgraph is not licensed by the underlying marketplaces and cannot grant third-party marketplace rights. See section 2. |

This replaces the earlier status, "pending written redistribution confirmation" (#403, #411 build notes of 18 Oct 2026). The maintainer's earlier review of the public Terms of Service and commercial API documentation still stands as background.

## 2. Marketplace terms: not resolved

Soldgraph's confirmation does not cover the marketplaces' own rights in their listing content. For each marketplace:

| Marketplace data | What is unresolved | Effect today |
|---|---|---|
| eBay sold listings obtained **through Soldgraph** (`soldgraph:ebay_*_sold`) | Whether eBay's terms restrict publicly displaying individual listings or links obtained through a third party | Individual listings are **not** shown publicly (flag below). Our own derived valuations and counts are not affected. |
| eBay listings obtained through **our own eBay Browse API key** (`ebay_browse:*`, plus the v1 tables `pin_market_estimates` and `ebay_listing_snapshots`) | Governed by eBay's API License Agreement, which is separate from Soldgraph | Kept separate (section 4). Its retention and display stay as they are until that licence is reviewed for the intended use. |
| Vinted and Whatnot current listings via Soldgraph (`soldgraph:vinted_*`, `soldgraph:whatnot_*`) | Whether those platforms restrict public display of individual listings | Not shown publicly. Used only as secondary "asking price" evidence. |

Until a marketplace's position is resolved, **raw marketplace listings** stay behind a public-display flag that is off in production. Raw listings are individual rows with a price, date or link. This is not a dispute with Soldgraph; it is caution about rights Soldgraph cannot give.

## 3. What each flag gates

| Flag (API server) | Gates | Production | What must be true before turning it on |
|---|---|---|---|
| `SOLDGRAPH_ENABLED` | Any call to Soldgraph (kill switch) | off | Budget row set; staging pilot accepted |
| `MARKET_VALUATION_V2_ENABLED` | Writing and reading per-market valuations (`GET /api/pins/:pinId/market-valuations`) | off | **#411 data quality cleared** for each published market (section 6) |
| Per-market publication allow-list (SG-12, #446) | Which markets' valuations the read returns | none | That market's evidence verified region-true (#411 / #450) |
| `MARKET_COMPS_PUBLIC_ENABLED` (SG-12, #446) | Public comparable-sales endpoint: individual listings with date, price, currency, marketplace and link | **off** | Marketplace terms resolved for the source shown (section 2) |

Turning on valuations never turns on comparable listings; they are separate switches. The flags in the last two rows are added by #446. Until it merges, they don't exist and nothing is exposed.

## 4. Provenance: Soldgraph and eBay Browse kept apart

- **One source id per provider × marketplace × market × sold/active.** Every stored listing row carries its `source_id` in `market_sources`, for example `soldgraph:ebay_gb_sold` versus `ebay_browse:ebay_gb_active`. Soldgraph-sourced eBay data and our own eBay Browse API data are never merged into one row or one source id.
- **The v1 eBay valuation is separate.** It uses its own tables (`pin_market_estimates`, `ebay_listing_snapshots`, migration 016). Valuation v2 does not write them.
- **Derived valuations record which sources they used.** `market_valuations.sources` holds only `source_id`, count and latest date. That is enough to trace a value to its provider without exposing listing detail.
- **Region provenance comes from migration 054 (#450).** It records the site searched, the location filter, the item's country, the displayed currency and whether the price was converted. Rows without it are not regional evidence.

## 5. Retention

**Policy (maintainer, 21 Oct 2026):** historical pricing data, source details and catalogue-matching results are **not deleted automatically just because of their age** (for example, after 90 days). Soldgraph imposes no retention limit (section 1). This covers:
- stored listing rows, accepted and near-miss, with their match score and rejection reason;
- valuations and their history;
- provider usage records.

Deletion still happens when another rule requires it:
- **Marketplace or API licence terms.** eBay Browse API data stays on its configured retention until eBay's licence is reviewed (section 2).
- **Data-protection law.** No seller names, images, location text or other personal data are stored in market tables (migrations 049 and 054). If any personal data ever enters them, UK GDPR storage limitation applies to that data.
- **A pin being deleted.** Rows are tied to `pins.id` and cascade.
- **A deliberate maintainer action**, for example `purge_market_listings('<source>', true)` if a plan ends.

**Implementation status:**
- **Today, nothing deletes on a timer.** There is no scheduled job, and `purge` only runs when someone runs it by hand. However, migration 049 still gives every source a `retention_days` value (default 30, at most 365), and the purge command deletes rows past it.
- **SG-12 (#446) changes this.** Soldgraph sources get no age-based expiry: migration 055, staging first, never applied by an agent. `purge` will then leave Soldgraph rows alone unless the maintainer deletes them explicitly. Each recalculated valuation is also kept as a history row instead of only overwriting the last one.
- **Until 055 is applied, don't run `market-refresh.mjs purge --apply`.**

## 6. Data quality: blocker on publishing regional values

#411 found that the pilot's FR eBay sold values were UK sales converted to euros, and that UK values included international sales. #450 (merged) adds domestic-only searches and region provenance.

Until the pilot is re-run and the results verified, **no regional valuation is published**. In particular, no FR value is published, and no UK value either until its re-run is checked. Technical work continues on staging.

## 7. Attribution

Soldgraph attribution is optional. #410 may show a neutral "Based on N recent sales" line with or without naming Soldgraph. If a marketplace is named next to its own listings, follow that marketplace's brand rules once section 2 is resolved.
