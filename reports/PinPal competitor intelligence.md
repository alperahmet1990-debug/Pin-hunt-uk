# PinPal looks like a US marketplace, not yet a UK rival (provisional)

> **Status: PROVISIONAL.** Revised 2026-10-14. Do not cite externally until the verification tasks at the end are done.
>
> **Limitations**
> - **(a) PinPal was not opened directly.** thepinpal.com, apps.apple.com and appgoblin.info were blocked by this environment's network policy. They were rechecked on 2026-10-14 and are still blocked. **Every PinPal fact comes from search-engine snippets or aggregator summaries.** No scraping, image downloads or endpoint probing was done, and robots.txt and the Terms were not read.
> - **(b) The live PinHunt Master Catalogue (Supabase) was not accessible.** PinHunt-side facts come from repo files only, so live counts are inferred or unknown.
> - **(c) Missing search results are NOT evidence that PinPal lacks a pin.** Only about 12 PinPal URLs are indexed.
>
> Labels: **Verified (snippet)** means the text was attributed to an official PinPal or App Store page in a search result. **Assumed/Inferred** means analyst reasoning.

PinPal (thepinpal.com, iOS app id6756037215) is a **young, US-centric Disney pin social marketplace** with no visible traction: launched mid-2026, **no displayable App Store rating** by October, no Android app ([App Store](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)). Its strengths are a public, SEO-indexed web catalogue, photo scanning, iPad support and an in-app marketplace with checkout, a model PinHunt has deliberately ruled out. Its catalogue size ("85k+", "150k+") is **unverified**. Its DLP, Disney Store UK, Loungefly and Artland coverage is **not determinable** from here, because nothing indexed shows it either way.

An earlier draft compared PinPal against PinHunt's 182-pin trusted subset as if it were the whole catalogue. **That baseline was wrong.** PinHunt's live catalogue is very likely the **V2 Collectible PinTrader (CTP) import, live since about 2026-09-01, about 3,000 pins** (inferred; the data and count are not in the repo). It succeeded a 13k speculative seed (V0, archived) and the 182-pin trusted beta stop-gap (V1). A research pipeline is pending, and none of it is imported (see the Catalogue section). So whether PinHunt leads in the UK/EU niche is **unproven either way**. PinPal's data cannot legally be imported or used for systematic verification.

## Sources disagree on pin count, developer and payments

Several basic facts conflict across sources. All are **UNVERIFIED pending direct access**.

| Topic | Conflict | Best current reading |
|---|---|---|
| Catalogue size | "85k+" was **not found** in any indexed PinPal snippet, the App Store listing or press. AppGoblin lists a **150,000+** claim for this app id ([AppGoblin](https://appgoblin.info/apps/6756037215)). The unrelated "Pin Trading – Scan & Collect" (Evergreen Apps) advertises **130k–150k+** ([App Store](https://apps.apple.com/us/app/pin-trading-scan-collect/id6751493504)). | **Unverified.** The 150k figure may be PinPal's own marketing claim, or it may be confused with the other app. For scale, Pin & Pop claims about 118k ([Pin & Pop](https://pinandpop.com/)). |
| Developer | App Store snippet says **7Labs Cloudware LLC**. AppGoblin says **Felipe Tavares**. | Unresolved (rename, transfer, individual vs entity, or aggregator error). No founders, funding or press found. |
| App name | Store title is "PinPal: Pin Trading & Scanner". Site structured data and AppGoblin say "PinPal: Scan & Organize Pins" ([thepinpal.com](https://thepinpal.com/)). | Probably renamed. |
| Launch / version | AppGoblin gives a July 2026 release. Version history snippets show 1.0–1.2.7 with inconsistent dates. | Launched in 2026, with fast iteration. |
| Marketplace payments | *Pending recheck.* Version history shows cart and "checkout reliability". AppGoblin quotes "secure payments and buyer protection". Fees and payouts not found. | **Very likely** processes payments between collectors. |
| ISO / set gaps | *Pending recheck.* Search results conflict; the listing reportedly mentions an ISO list, for-trade marking and "see what is still missing from sets". | **Probably present.** |
| Free scans / Premium | *Pending recheck.* "Unlimited free scans" (moderate confidence). Premium in-app purchases at €9.99 and €44.99 (AT storefront). Period and gated features unknown. | Unverified. |

The WDWNT AI-altered-photo story concerns Pin Trading – Scan & Collect, **not PinPal** ([WDWNT](https://wdwnt.com/2026/09/disney-pin-trading-app-uses-ai-to-alter-womans-appearance-without-permission-for-ad-constantly-stealing-photos-stories-from-others/)). "PinPal" searches also return unrelated products (bowling app, pin-pal.com binders, a 2012 Pinterest parody).

## Strengths and weaknesses, verified versus assumed

**Verified strengths (snippet):** PinPal runs a **public web catalogue** at `/catalog/pin/{uuid}`, `/catalog/set/{uuid}/{slug}` and `/explore`. Search covers character, origin, set, year and photo, and set pages carry SEO titles such as "Blue Paint Jar Disney Pins" ([Explore](https://thepinpal.com/explore); [set page](https://thepinpal.com/catalog/set/1cf000db-0c8c-4208-910c-a4da68dbd96f/blue-paint-jar)). Pin pages show origin, collection, set, edition size, year, sometimes original retail price, and live **collector / for sale / for trade counts** ([Simba Symbol](https://thepinpal.com/catalog/pin/45b4ac0d-9a25-41f4-a783-ff0bab10a7b3)). It has historical US depth and at least one 2026 Hong Kong record ([Elsa, Anna & Olaf](https://thepinpal.com/catalog/pin/09512131-07ea-4c4c-ba10-13ca231b2dcf)). Version 1.2.0 added iPad support and event and trading-location maps. Its liability wording is worth copying: "A catalog match is a research lead. It does not authenticate the physical pin or establish its value" ([pin page](https://thepinpal.com/catalog/pin/3665a1dd-3c44-4a2a-874f-e186f52c535b)).

**Verified weaknesses (snippet):** no displayable rating, no Google Play app, **no public user discussion** (Reddit, Disney Pin Forum, Trustpilot, YouTube), and no automated valuation, only a "value research guide" and asking-price references.

**Not determinable:** site searches for Disneyland Paris, Pin Trading Night, Loungefly, Artland, Windows of Attraction, Enchanted Doors, Brush of Magic and Animated Cuties returned no PinPal pages. With a thin index and blocked direct access, this is **no indexed evidence, not evidence of absence**. Do not describe PinPal as lacking DLP or UK coverage.

**Assumed (unproven):** bulk-seeded from community databases (WDI, DEC and MII origin codes mirror PinPics and Pin & Pop); one-pin "sets" may inflate counts; Premium gates extras rather than scans; PinPal takes a commission.

## Catalogue: the comparison is not yet possible

**PinPal coverage in the 38-row sample:**

| Bucket | Rows |
|---|---|
| **Verified present on PinPal** (snippet) | 5: WDI Queen of Hearts Adorbs LE 300 (2021), DEC Blue Paint Jar set (2024), Disney Princess Cameo set (2024), Spotlight Tikis Minnie LE 1000 (2008), HKDL Elsa, Anna & Olaf (2026) |
| **Verified PinPal gaps** | **None verified.** No row is proven missing on PinPal. |
| **Not determinable (network-blocked)** | 33: all DLP (LEs, the Sept 2026 "Enchanted" Pin Trading Night), Disney Store UK, Loungefly, Artland, the WDW 2026 monthly series (Windows of Attraction, Enchanted Doors), Brush of Magic, Animated Cuties, 2025 WDW monthly series, and others |

None of the 5 is in any PinHunt local source, but they are older US/WDI/DEC/HKDL issues a CTP export could cover, so live presence is **unknown**. Nothing shows either side ahead in the UK/EU segment.

**PinHunt's catalogue, by generation** (from repo files; live status inferred):

| Generation | Size | Status |
|---|---|---|
| V0 speculative seed | 13,000 rows (12,818 archived after V1) | Archived, largely synthetic. Its DLP (938), Loungefly and Artland (~1,000 each) rows are **not coverage**; ~179 source-verified rows and 46 real 2026 ArtLand rows are research leads only. |
| V1 trusted subset (182 pins, 18 sets; beta stop-gap) | 182 | Imported 2026-07-31. Whether it is still live after V2 is **unknown**. |
| V2 Collectible PinTrader import | **about 3,000 (inferred; count not in repo)** | **Very likely live since about 2026-09-01.** Origin and year mix unknown. The importer's classifier hints at some DLP and Loungefly groups (weak inference). |
| Research pipeline | 77 engine candidates (52 new), pilot 28, POC 74 (49 gaps) | **None imported.** Migration 045 staging status unknown. |

**Withdrawn as catalogue-wide claims** (true **only for the trusted subset plus the local pipeline**; live status unknown): "zero DLP, Loungefly or Artland pins", "both sides lack Paris", WoA and Enchanted Doors "frozen at 7 of 12", and "2025 WDW monthly series absent".

Pending research: **WoA #8–10** are pilot-28 candidates (#10 rests on an [eBay listing](https://www.ebay.com/itm/146565862079)); **Brush of Magic** S2, S3 and LE pins and **Animated Cuties S2** are engine candidates ([Extra Magic Minutes](https://www.extramagicminutes.com/blog/disney-brush-of-magic-pin-series-collection-disney-store-2026); [Disney Pins Blog](https://disneypinsblog.com/animated-cuties-mystery-pin-set-at-disney-parks)). **Enchanted Doors Aug–Oct** and the **2025 WDW monthly** series are in no local source ([Disney Pins Blog](https://disneypinsblog.com/disney-parks-2025-monthly-pin-collections/)). For DLP scale, Pin & Pop lists 5,379 DLP-origin pins ([Pin & Pop DLP](https://pinandpop.com/pins/origin/DLP)), and DLP held an "Enchanted" Pin Trading Night in Sept 2026 ([LaughingPlace](https://www.laughingplace.com/disney-parks/dlp-pin-trading-nights-sept-2026/)).

**Data-quality findings in the trusted rows** (verified in the workbook; **live status unknown**, since they may have been superseded by V2):

- **Retailer scope conflicts.** Toys in a Box 2025 and Character Folding Fans 2024 are WDW sets, but their rows claim Disney Store UK/EU. Mickey & Friends CNY 2025 is Shanghai in its rows but "Disney Store" in its set summary. The UK claims cite pinandpop.com, not shopDisney UK.
- **Uncertain subject.** Windows of Attraction #5 is "Tower of Terror – Goofy" in trusted but "Twilight Zone Tower of Terror" in the POC, which rates it Low confidence.
- **Unsearchable names.** Enchanted Doors pins are named only by month ("January 2026 – Enchanted Doors").
- **Brush of Magic edition conflicts** (in candidates): Sorcerer Mickey 2,250 vs 3,750, Darkwing Duck 3,750 vs 3,250, Cinderella 3,750 vs 2,000.

No PinPal pin-level errors could be checked.

## Images and licensing: use PinPal only as a lead, never as a source

Second pass, 2026-10-14 (direct access still blocked):

- **Host and provenance: UNKNOWN** (network-blocked). Search results expose only HTML page URLs, so self-hosted vs hotlinked cannot be told.
- **How images are displayed (snippet):** set pages show "reference images and release details" and group "the approved PinPal records". The site says catalogue membership "does not authenticate, appraise, or establish" a pin's provenance ([set page](https://thepinpal.com/catalog/set/1cf000db-0c8c-4208-910c-a4da68dbd96f/blue-paint-jar)). "Approved" implies a moderation step (inferred).
- **No credits, watermarks, attribution lines or user-upload licence** were found in the index. The ToS and Privacy text are not indexed ([home](https://thepinpal.com/)). This is not evidence of absence.
- **Pin & Pop:** its API licence (snippet) is "by approval and license agreement only". It **prohibits public display of images**, requires visible attribution and bans redistribution ([Pin & Pop API](https://pinandpop.com/docs/api/v1-pins)). No snippet shows Pin & Pop attribution on PinPal. PinPal is therefore **unlikely to be using Pin & Pop images under the standard licence** (inferred). A bespoke deal cannot be ruled out, and there is no evidence of any partnership with Pin & Pop, PinPics or Disney.
- **Developer identity conflict:** 7Labs Cloudware LLC vs Felipe Tavares (see above). This matters for any licence enquiry.
- **No public API or export**; only opaque UUID keys.

Legally (not legal advice), UK database right covers *repeated, systematic extraction of insubstantial parts* ([reg. 16](https://www.legislation.gov.uk/uksi/1997/3032/regulation/16?view=plain); [Art. 7](https://www.legislation.gov.uk/eudr/1996/9/article/7)). Even if a US LLC lacks sui generis protection, ToS clauses bind as contract and pin photos carry Disney and photographer copyright. A lawyer should confirm.

**Verdict: no import of PinPal data or images, and no automated lookups.** At most, a **one-off human research lead** (an admin checking one pin to resolve a conflict), only after the ToS is read, and corroborated by a rights-cleared source that becomes the Master Catalogue provenance. `access_policy.json` is default-deny; an explicit entry (`network_reachable: false`, `terms_reviewed: false`, `fetch_permitted: false`) would document it.

Legitimate routes, in order: (1) finish the **Collectible PinTrader** rights record (permitted; CC variant still TODO); (2) **consented user submissions** with a licence grant; (3) **official Disney, DLP and shopDisney UK pages, facts only**; (4) the **eBay official API**; (5) **Pin & Pop via the `PinRepository` seam**, the natural DLP partner (parked in #78); (6) a low-cost **licence enquiry to PinPal**.

## Features: PinPal sells pins, PinHunt helps people trade them

PinPal claims below are *pending recheck*.

| Area | PinPal | PinHunt UK today |
|---|---|---|
| AI recognition | Photo search for "possible visual matches"; disclaims authentication | Two-stage pipeline: OpenAI vision extraction, catalogue candidates, then image re-rank via the API server |
| Scan limits | "Unlimited free scans" (moderate confidence) | No app limit; API usage limits planned (#36) |
| Web / SEO | Public explorer; indexed pin and set pages | None public; web build sits behind login |
| Collection states | Collection, for-sale and for-trade counts; ISO probably present | Distinct `owned`, `for_trade` and `wanted` states, boards, and a plain-text collection export |
| Sets | Public set pages; "what's missing" probably present | First-class sets with X-of-Y progress and set traders |
| Valuation | Guide and asking-price references; USD | Automated eBay GB and US comparables, GBP-first |
| Trading | Listings, messaging, trading-location map, events | Trade flow, traders per pin and set, trade ratings, opt-in Collectors Nearby, DMs |
| Marketplace | Cart and checkout; payments and "buyer protection" very likely | **None by design.** Links out to Vinted or eBay |
| Subscription | Premium at €9.99 and €44.99 (AT) | None |
| Platforms / sign-in | iPhone and iPad, web catalogue | iOS-first, no tablet; email and password only |

The category is crowded: Pin Trading – Scan & Collect (~1.7K ratings; paywall after 20 scans, ~$40/yr, [Google Play](https://play.google.com/store/apps/details?id=com.pintrading.pinscanner&hl=en_US)), MagicPin (~1.2K ratings, 4.6★, [App Store](https://apps.apple.com/us/app/magicpin-disney-pin-collector/id1554341677)). **Scanning and ISO lists are table stakes.** PinPal user feedback is effectively nil.

## Five UK and European openings

UK and EU collecting is fragmented: DLP LEs go through Lineberty queues ([pintrader.club](https://www.pintrader.club/articles/buying-limited-edition-pins-at-disneyland-paris)); Disney Store UK runs £25 ticketed events (Manchester 13 Nov, London 25 Nov 2026; tickets **21 Oct, 5pm**) ([Mickey From The UK](https://mickeyfromthe.uk/news/disney-store-pin-trading-events-coming-to-london-manchester)); meetups run over Instagram DM ([Disney and Days Out](https://disneyanddaysout.co.uk/uk-pin-trading-events-2026)); since 1 July 2026 UK-to-EU gifts over €45 incur €3 per HS code plus €2 ([Royal Mail](https://www.royalmail.com/europeantradeinsights)); DLP LE counterfeits were confirmed in February 2026 ([Disniverse](https://disniverse.com/pintrading/)).

Status is taken from the repo and GitHub issues as of 2026-10-14. Issue priority labels are quoted as they appear on the issues.

| # | Opportunity | Why it matters | Status |
|---|---|---|---|
| 1 | **DLP and UK catalogue depth**: DLP LEs and Pin Trading Nights, Disney Store UK exclusives, Loungefly and Artland (Loungefly flagged non-tradeable at DLP, [Disniverse](https://disniverse.com/pintrading/)) | A credible UK/EU catalogue owns the niche. Live depth on both sides is unknown. | **PARTIALLY BUILT** (research pipeline; #240, #241 P1). DLP content and the non-tradeable flag are **GENUINELY NEW** |
| 2 | **UK/EU Release & Event Radar** linked to ISO alerts | A US app has no reason to track Lineberty or Disney Store UK drops | **GENUINELY NEW**; push prerequisites **IN BACKLOG** (#34, #35 P1; #110 P2) |
| 3 | **Shareable ISO and For Trade pages**, kept separate, plus public catalogue set and pin pages | Reaches collectors on Instagram and Vinted | Lists **IN BACKLOG** (#73, #146, #147, P1); plain-text export **ALREADY BUILT**. #147 is opt-in and `noindex` by design, so the SEO idea applies only to **public catalogue set and pin pages** (**GENUINELY NEW**) |
| 4 | **Cross-border trade-shipping helper**: €45 threshold, fee estimate, CN22 wording, declared value from valuation | Each collector buys their own postage, so the trade-only model stays intact | Cross-border part **GENUINELY NEW**; generic guidance **IN BACKLOG** (#144 P2, #75 P3) |
| 5 | **Trust layer**: back-stamp references, counterfeit flags, Trade Circle, "identifies, does not authenticate" scan wording | A swap-only community has no buyer protection ([Vinted](https://www.vinted.co.uk/items/481175479-pins-disney)) | Trade ratings **ALREADY BUILT**. Trade Circle and trust items **IN BACKLOG** (#33 P1, #143 P2, #149 P3, #74 P3). Counterfeit flag and scan disclaimer **GENUINELY NEW** |

## Backlog recommendations for maintainer review

The P0/P1/P2 labels are this report's own suggestions for maintainer review. **They do not change existing issue priorities.**

| Pri | Recommendation | Status |
|---|---|---|
| **P0** | Run read-only queries to establish live catalogue counts (V2 by origin and year; whether the trusted 182 are still live) before any coverage claim | **GENUINELY NEW** |
| **P0** | Bring the WDW 2026 monthly sets up to date (WoA #8–10, Enchanted Doors Aug–Oct) and promote Brush of Magic S2, S3 and LE pins after resolving the edition conflicts, if live lacks them | **PARTIALLY IN BACKLOG** (route #240, #241 P1; no issue names these pins) |
| **P0** | DLP research pass (2025–26 LEs, Pin Trading Night) via rights-cleared sources; prioritise Pin & Pop discussions | **GENUINELY NEW** (Pin & Pop integration is **ROADMAP ONLY**, parked in #78 P3) |
| **P0** | Fix the trusted-row UK retailer scope conflicts and re-source UK claims from shopDisney UK, if those rows are still live | **GENUINELY NEW** |
| **P0** | Add an explicit thepinpal.com entry in `access_policy.json`; a human reads PinPal's ToS | **GENUINELY NEW** (default-deny already blocks it) |
| **P1** | Shareable ISO and For Trade lists; public catalogue set and pin pages | Lists **IN BACKLOG** (#73, #146, #147 P1); catalogue pages **GENUINELY NEW** |
| **P1** | Release and Event Radar with ISO alerts | **GENUINELY NEW** |
| **P1** | Sign in with Apple and Google | **GENUINELY NEW** (no issue) |
| **P1** | "Identifies, does not authenticate" wording on scan results | **GENUINELY NEW** |
| **P1** | Online Safety Act illegal-harms risk assessment for community, DMs and trade chat ([Ofcom](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act)) | Assessment **GENUINELY NEW**. Moderation tooling **PARTIALLY BUILT** with block/report **IN BACKLOG** (#16, #17 P0) |
| **P1** | Collectors Nearby: store location at city or outward-code level instead of the full-postcode centroid ([ICO](https://ico.org.uk/switched-on-to-privacy/choosing-settings/location-settings/)) | **PARTIALLY BUILT**: it is already opt-in, off by default and shows distance bands. Coarser storage is **GENUINELY NEW** |
| **P2** | Cross-border shipping helper; event trade boards for location exclusives | **GENUINELY NEW** (#144 P2 covers generic guidance) |
| **P2** | GBP and EUR valuation adding eBay.de and eBay.fr | **PARTIALLY BUILT** (GB and US only); currency preference **IN BACKLOG** (#79 P3) |
| **P2** | Populate and display PinPics and Pin & Pop IDs ([eBay.de](https://www.ebay.de/itm/275836736486)) | **PARTIALLY BUILT**: `pin_external_ids` and Pin & Pop id matching already exist |
| **P2** | iPad support; counterfeit-flag and back-stamp fields in the Master Catalogue | **GENUINELY NEW** (back photo on submissions, #257, is related) |

**Genuinely new** (no issue, not built): live-count verification, DLP research, UK retailer fixes, Event Radar, Apple/Google sign-in, scan disclaimer, Online Safety Act assessment, coarser Nearby storage, cross-border shipping helper, event boards, EU eBay valuation, iPad, counterfeit and DLP non-tradeable flags, public catalogue pages.

## Conclusion

PinPal shows where the US market is heading: free scanning, public SEO-driven catalogues, and money made from transactions. PinHunt's no-payments stance is not a weakness against it. For a swap-only community, it is the basis for a trust-led product. PinPal's clearest lesson is distribution: indexed public catalogue pages collect search traffic that PinHunt, behind a login, cannot reach.

With the corrected baseline, **PinHunt's UK/EU advantage is unproven either way.** PinHunt's live V2 counts are unknown, and PinPal's DLP and UK coverage cannot be determined from here. The next step is to measure both before making any competitive claim.

## Outstanding verification tasks

1. Open thepinpal.com in a normal browser. On 2–3 pin pages, use "Copy image address" and note the image host. Check for watermarks and credits, and do not save images.
2. Read PinPal's Terms and Privacy pages. Note the content licence, scraping clause, DMCA contact, Disney disclaimer and legal entity. Also read `robots.txt`.
3. Check the UK and US App Store listings: developer/seller, rating, Premium tiers and GBP/USD prices, privacy labels, the free-scan claim, payments and buyer protection.
4. Confirm the catalogue size claim (85k+ / 150k+) on the site or listing.
5. Re-run the 38-row sample on `/explore` by hand.
6. Run read-only Supabase queries Q1–Q10 from `research_notes/PinPal competitor intelligence/catalogue_baseline_corrected.md` to establish live V2 counts by origin and year, and whether the trusted 182 are still live.
7. Re-score the PinPal gap buckets and the catalogue section using the results of steps 5–6.
8. Have a human record the thepinpal.com review outcome in `research/catalogue-engine/access_policy.json`.
9. For maintainer awareness, without editing them: `docs/research/independent-catalogue-poc/README.md` and `docs/research/scan-independence/README.md` also treat the 182 as the live catalogue.
