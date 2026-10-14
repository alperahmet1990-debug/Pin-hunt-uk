# PinPal (thepinpal.com) catalogue: claim check, completeness and pin-level comparison with PinHunt UK

Research date: 2026-10-14. Labels: **VERIFIED** = I saw it myself, either in a search-engine result snippet or title, or in a local PinHunt file I read. **INFERRED** = my reasoning from those, not directly observed.

**Important method limitation (VERIFIED):** This environment's network policy blocks direct page fetches of `thepinpal.com` and `apps.apple.com`. WebFetch returned `getaddrinfo ENOTFOUND`, and curl through the agent proxy returned `CONNECT tunnel failed, response 403`. That means I could not read PinPal's robots.txt, terms, homepage, any catalogue page or the App Store listing directly. I did not try any workaround (no archive/cache, no mirrors). Every PinPal fact below comes from search-engine result titles and snippets, which are third-hand summaries of the pages. PinPal's pages are thinly indexed by the search tool: about 12 distinct thepinpal.com URLs surfaced across about 8 site-restricted queries. As a result, **most per-pin "found on PinPal?" answers are "not determinable", not "absent".** A human with a normal browser should finish the spot-check (see Gaps).

## Where does the "85k+ pins" claim appear, and is it plausible?

### Takeaway
I found no public source for "85k+ pins". It did not appear in any indexed snippet of thepinpal.com, the explore page, the App Store listing or any press coverage. The size is therefore UNVERIFIED. For scale, competing databases advertise 118k–150k pins. If PinPal's figure exists, it probably sits on a page the search index doesn't surface, such as the live homepage hero or in-app onboarding.

### Cited Findings
- VERIFIED (search snippet): An extended search for `PinPal "85,000" OR "85k+"` returned PinPal's explore page, homepage and App Store listing. None of their indexed snippets contained an 85k figure, and the search tool explicitly found "no source that mentions 85,000 or 85k+ for PinPal" — [PinPal explore](https://thepinpal.com/explore); [PinPal home](https://thepinpal.com/); [App Store listing](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED (snippet): The PinPal homepage describes itself as "the ultimate Disney pin trading platform": "Buy, sell, trade and collect Disney pins, search by image, manage your collection, and connect with fellow Disney pin traders." — [PinPal home](https://thepinpal.com/)
- VERIFIED (snippet): The explore page says "Search the PinPal Disney pin database, browse collections and recent releases, and identify pins by character, origin, set, year, or photo." — [PinPal explore](https://thepinpal.com/explore)
- VERIFIED (snippet): The App Store app is "PinPal: Pin Trading & Scanner" (id6756037215) by 7Labs Cloudware LLC. It is free with in-app purchases ("Premium" at €9.99 and €44.99), in the Lifestyle category, rated 13+, 92.1 MB and designed for iPad. Version 1.2.0 (1 Sep) brought marketplace/cart layout changes, tablet support and updated events/trading locations, and 1.1.3 came out 22 Aug. The self-reported privacy section lists Third-Party Advertising and Usage Data. Visual search "assists with identification and does not authenticate physical pins". — [App Store listing](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)
- VERIFIED (snippet): No Android/Google Play listing for PinPal surfaced. — same search set as above
- VERIFIED (snippet), context only: Competitor size claims are Pin & Pop at "118,074 Pins and growing" and "Pin Trading – Scan & Collect" (Evergreen Apps, unrelated to PinPal) at "130,000+" or "150,000+" pins, depending on listing/snippet. Per the brief, these are not cited as evidence of pin facts. — [Pin & Pop](https://pinandpop.com/); [Pin Trading – Scan & Collect](https://apps.apple.com/us/app/pin-trading-scan-collect/id6751493504)
- VERIFIED (snippet), context only: Pin & Pop's DLP origin page lists 5,379 DLP pins, which gives a rough scale for what a "complete" DLP catalogue means. — [Pin & Pop DLP origin](https://pinandpop.com/pins/origin/DLP)
- VERIFIED (snippet): A PinPal set page describes itself as grouping "the approved PinPal records currently assigned to the Blue Paint Jar set". — [PinPal set: Blue Paint Jar](https://thepinpal.com/catalog/set/1cf000db-0c8c-4208-910c-a4da68dbd96f/blue-paint-jar)
- VERIFIED: A WDWNT story from Sept 2026 about a "Disney pin trading app" that used AI to alter a woman's photo in an ad concerns "Pin Trading – Scan & Collect", per the search tool's summary, not PinPal. Don't attribute it to PinPal without reading the article. — [WDWNT](https://wdwnt.com/2026/09/disney-pin-trading-app-uses-ai-to-alter-womans-appearance-without-permission-for-ad-constantly-stealing-photos-stories-from-others/)

### Inferences
- INFERRED: The App Store id (675603xxxx) sits in the range Apple was assigning in roughly late 2025. Combined with versions only reaching 1.1.3/1.2.0 in Aug–Sep (presumably 2026), PinPal looks like a young app, under about a year old. A young app with 85k records almost certainly bulk-seeded its catalogue rather than building it by hand. Older-pin coverage would then depend on the seed source, which is unknown.
- INFERRED: The phrase "approved PinPal records" implies a moderation/approval queue, probably for user-submitted or imported records. If "85k" exists, it may count approved records only, or all records including pending ones. That is unknown.
- INFERRED: PinPal's "sets" look very granular. A 1-pin "set" (Mickey Mouse Head Fire Breathing Dragon) and a 10-pin "Blue Paint Jar" set inside a "Color Shades of Magic" collection point to a two-level model (collection > set) that splits finely. That pattern would inflate set counts, and possibly pin counts if variants (back-stamps, jumbo/mini, packs) are separate records. Plausibility of 85k: about 70% of Pin & Pop's claimed size. That is plausible for a bulk-seeded database, but it would cover far more than recent DLP/UK releases. Whether it counts non-Disney pins is unknown. Every PinPal record I saw was Disney.
- INFERRED: The marketplace sells in USD ($10.00 listing), so PinPal is US-centric and its own platform handles buy/sell. That contrasts with PinHunt's no-payments stance.

### Gaps
- Can't confirm where or whether "85k+" is stated, or what it counts (variants? packs? pending records?). Needs a manual browser visit to thepinpal.com homepage/explore and the App Store description.
- PinPal's robots.txt and terms of use couldn't be read (network block). Bulk-access permissions are unknown.
- I found no press coverage, launch announcement or independent review of PinPal.

## How is PinPal's catalogue browsable, and what fields does it show per pin?

### Takeaway
The catalogue is public, server-rendered and indexable at `/catalog/pin/{uuid}`, `/catalog/set/{uuid}/{slug}` and `/marketplace/pin/{uuid}`, plus an `/explore` search page. Pin records show name, collection/set, origin (park/issuer code), edition (OE / LE n) and year. I saw no evidence of release date, original price or park-vs-retailer nuance in any snippet.

### Cited Findings
- VERIFIED (snippet): The pin page "Queen of Hearts — Adorbs" shows origin Walt Disney Imagineering (WDI), year 2021, collection "Adorbs" / set "Alice in Wonderland Adorbs", and limited edition 300, from a blind-box set. — [PinPal pin](https://thepinpal.com/catalog/pin/374af210-6e8a-4c3b-bd1e-470129df845f)
- VERIFIED (snippet): The "Elsa, Anna & Olaf — Frozen" page shows origin Hong Kong Disneyland, collection Frozen, Open Edition, year 2026. This was the only 2026 record that surfaced. — [PinPal pin](https://thepinpal.com/catalog/pin/09512131-07ea-4c4c-ba10-13ca231b2dcf)
- VERIFIED (snippet): "Minnie Mouse — Spotlight Tikis" is LE 1000 in the Spotlight series. — [PinPal pin](https://thepinpal.com/catalog/pin/075d9fd9-e53f-44fc-9f59-a3381cbf9b6a)
- VERIFIED (snippet): The "Blue Paint Jar" set has 10 pins, in the Color Shades of Magic collection, 2024, origin DEC. — [PinPal set](https://thepinpal.com/catalog/set/1cf000db-0c8c-4208-910c-a4da68dbd96f/blue-paint-jar)
- VERIFIED (snippet): The "Disney Princess Cameo" set has 4 pins, 2024, origin "MII". The code isn't explained in the snippet. — [PinPal set](https://thepinpal.com/catalog/set/de6981fa-b152-49cf-9d1c-26db86e49b8b/disney-princess-cameo)
- VERIFIED (snippet): The "Mickey Mouse Head Fire Breathing Dragon" set has 1 pin, Fire Breathing Dragons collection, 2008, WDI. — [PinPal set](https://thepinpal.com/catalog/set/e7fc5a08-0666-402a-859d-51dfb2524948/mickey-mouse-head-fire-breathing-dragon)
- VERIFIED (titles only): Other indexed pin pages are "Ariel Silhouette — Little Mermaid…", "Hei Hei — Princess Castle", "Goofy & Donald — April Fools' Day…", "Aurora — Disneyland 60th Anniversary" and "Simba Symbol — Lion King Icons". — [Ariel](https://thepinpal.com/catalog/pin/3665a1dd-3c44-4a2a-874f-e186f52c535b); [Hei Hei](https://thepinpal.com/catalog/pin/b62e7f2d-df50-459d-9611-445d4ab213ae); [Goofy & Donald](https://thepinpal.com/catalog/pin/1c5510df-5eb4-4fc6-beec-b790eeb91524); [Aurora](https://thepinpal.com/catalog/pin/4d25d3bb-e002-4831-9211-d9333575d92f); [Simba Symbol](https://thepinpal.com/catalog/pin/45b4ac0d-9a25-41f4-a783-ff0bab10a7b3)
- VERIFIED (snippet): A marketplace listing offers "Simba Symbol — Lion King Icons" from an individual collector for $10.00. — [PinPal marketplace](https://thepinpal.com/marketplace/pin/28da6130-2c6e-4d5d-9321-0f0031b6efc0)
- VERIFIED (snippet): The App Store listing says you can photograph a pin "to search the PinPal catalog for possible visual matches". — [App Store listing](https://apps.apple.com/at/app/pinpal-pin-trading-scanner/id6756037215?l=en-GB)

### Inferences
- INFERRED: The field set (origin code, collection, set, edition, year) and origin codes like WDI, DEC and MII match the conventions of the large community pin databases. That suggests PinPal's seed data descends from that ecosystem rather than from original research. It's unproven and I didn't check against PinPics/Pin & Pop records.
- INFERRED: Page titles use the pattern "Character — Set". Set pages carry the title pattern "{Set} Disney Pins" and SEO text ("Research X, a Disney collectible pin from…"), so the site is built for search traffic.
- INFERRED: Because PinPal sets are public and individually addressable, PinHunt could reuse that UX idea (shareable set/ISO pages are already on PinHunt's roadmap). PinHunt's `pin_sets` model with "X of Y released" for ongoing monthly series is richer than anything visible on PinPal.

### Gaps
- Can't confirm whether PinPal shows release date, original price, retailer (e.g. shopDisney UK vs US), back-stamp/variant info, or market value per pin. None appeared in snippets.
- Can't confirm whether set pages show expected-vs-released counts for ongoing monthly series.

## Spot-check: pin-level coverage comparison (PinPal vs PinHunt) across DLP, WDW 2025–26, Disney Store UK, Loungefly, Artland and monthly/mystery sets

### Takeaway
None of the 38 sampled pins/sets could be confirmed on PinPal. Site-restricted searches for "Disneyland Paris", "Windows of Attraction", "Enchanted Doors", Pin Trading Night, Loungefly, Artland, Brush of Magic, Animated Cuties, Toys in a Box and Daring Detectives returned **zero thepinpal.com pages**. That is weak evidence of thin coverage of recent and European releases. It is **not proof of absence**, because the index of PinPal is small overall. On PinHunt's side, the local data shows clear and verifiable gaps. The trusted live catalogue (182 pins) has **zero DLP, Loungefly or Artland pins**. Its two ongoing WDW monthly series stop at July 2026 (7 of 12), even though our own POC research documents releases through October.

### Cited Findings: PinHunt local catalogue facts (VERIFIED from local files, read-only)
- VERIFIED: The trusted catalogue (`attached_assets/PinHunt_UK_Trusted_Test_Catalogue_1785531320477.xlsx`) has 18 sets: 16 mystery sets from 2024–2026 plus Enchanted Doors and Windows of Attraction, each at 7 of 12. Its Park/Retailer values cover WDW, EPCOT, Disneyland Resort, Shanghai/Disney Parks, Disney Store and "Disney Store UK/EU". **No row has Disneyland Paris, Loungefly or Artland.**
- VERIFIED: Windows of Attraction in trusted (PHUK-00000069–075) runs Haunted Mansion, WDW Railroad, Seven Dwarfs Mine Train, Kilimanjaro Safaris, Tower of Terror (Goofy), Many Adventures of Winnie the Pooh and Journey Into Imagination with Figment, all LE 2500 at $26.99. Enchanted Doors (PHUK-00000076–082) has January–July 2026 entries, LE 2500, $26.99.
- VERIFIED: The independent POC (`docs/research/independent-catalogue-poc/PinHunt_Independent_Catalogue_POC_2026.xlsx`) adds Windows of Attraction #8 Buzz Lightyear's Space Ranger Spin (Zurg, 2026-08-04, Medium), #9 Country Bear Jamboree (2026-09-01, Low) and #10 Walt Disney's Enchanted Tiki Room (2026-10-13, Low). None of the three is in trusted.
- VERIFIED: The POC also records 18 Brush of Magic open-sale LE pins (mostly LE 3,750; Sorcerer Mickey and Maleficent LE 2,250 with conflicts), plus Brush of Magic Mystery Series 2 (10 pins, 2026-06-16) and Series 3 (10 pins, 2026-09-01) and Animated Cuties Series 2 (8 pins, Low confidence). **None of these is in trusted.** Brush of Magic Mystery Series 1 (10) and Animated Cuties S1 (8) are in trusted.
- VERIFIED: `research/catalogue-engine/out/master_catalogue_candidates.csv` (77 data rows) consists of research candidates marked "Research candidate (not for import)".
- VERIFIED (context only, archived/non-authoritative): The archived 13k seed has suspiciously uniform counts per retailer: Disneyland Paris 938, Loungefly 969, ArtLand 902, D23/WDI/DEC/MOG 901 each. INFERRED: these are synthetic or placeholder rows and shouldn't count as DLP/Loungefly/Artland coverage.
- VERIFIED (local inconsistencies found while sampling):
  - Mickey & Friends Chinese New Year 2025: the set summary scope is "Multiple / Disney Parks / Disney Store", but the pin rows say "Shanghai Disney Resort / Disney Parks".
  - Character Folding Fans (2024): the set summary scope is "Walt Disney World", but the pin rows say "WDW / Disneyland Resort / Disney Store UK".
  - Toys in a Box (2025): the set summary scope is WDW, but the pin rows add "Disney Store UK / Disney Store EU".
  - The UK retailer claims on these rows have no UK source URL in the row (source is pinandpop.com). They should be re-verified against shopDisney UK.

### Cited Findings: external evidence on sampled sets
- VERIFIED (snippet): Disney Pins Blog says Animated Cuties launched at Disney Parks in January 2026 as $22.99 two-pin boxes from 8 possible designs. — [Disney Pins Blog](https://disneypinsblog.com/animated-cuties-mystery-pin-set-at-disney-parks)
- VERIFIED (snippet): Extra Magic Minutes describes the Disney Store Brush of Magic line (LE pins, a mystery blind pack released March 2026, more pins due August 2026). — [Extra Magic Minutes](https://www.extramagicminutes.com/blog/disney-brush-of-magic-pin-series-collection-disney-store-2026)
- VERIFIED (snippet): An eBay listing labels a Walt Disney's Enchanted Tiki Room pin as "Windows of Attraction". That supports the POC's #10, but it's a weak, non-official source. — [eBay](https://www.ebay.com/itm/146565862079)
- VERIFIED (snippet): LaughingPlace reports a Disneyland Paris Pin Trading Night with an "Enchanted" theme in Frontierland in September 2026. The snippet gives inconsistent dates (17 Sept at Cowboy Cookout Barbecue vs "Event on September 19"). Event pins are not itemised in the snippet. — [LaughingPlace](https://www.laughingplace.com/disney-parks/dlp-pin-trading-nights-sept-2026/)
- VERIFIED (snippet): A beginner's guide notes that DLP trading rules exclude Loungefly pins. That matters for PinHunt's UK/Paris trade matching. — [Disniverse guide](https://disniverse.com/pintrading/)
- VERIFIED (snippet): Disney Pins Blog lists 2025 WDW monthly LE series: Dining with Disney (LE 2,500), Disney Fairy Tale Moments (LE 2,500, $24.99), Disney Reflections (AP-exclusive, 12 pins, LE 1,500, $22.99) and Disney Wondrous Worlds (4 pins, LE 1,500, $34.99). None of these 2025 monthly series is in PinHunt trusted. — [Disney Pins Blog 2025 monthly](https://disneypinsblog.com/disney-parks-2025-monthly-pin-collections/)

### Sample comparison table
Legend for PinPal column: **Found** = a thepinpal.com page surfaced. **ND** = not determinable (no indexed PinPal page surfaced in site-restricted search; site not directly readable here). For PinHunt: **Trusted** = in the 182-pin live catalogue; **POC** = research-only, not live; **No** = absent from trusted, POC and candidates.

| # | Pin / set (scope) | External evidence | PinPal | PinHunt | Field issues noted |
|---|---|---|---|---|---|
| 1 | Windows of Attraction #1 Haunted Mansion (WDW, LE 2500, Jan 2026) | POC: Medium | ND | Trusted PHUK-00000069 | Trusted name is "Haunted Mansion – Windows of Attraction"; POC numbering "#1" absent in trusted |
| 2 | Windows of Attraction #5 Tower of Terror (WDW, May 2026) | POC: Low | ND | Trusted PHUK-00000073 | Trusted says "Tower of Terror – Goofy"; POC "Twilight Zone Tower of Terror", Low confidence, so the subject needs confirming |
| 3 | Windows of Attraction #7 Imagination/Figment (WDW, Jul 2026) | POC: Medium | ND | Trusted PHUK-00000075 | none |
| 4 | Windows of Attraction #8 Buzz Lightyear (Zurg) (WDW, 2026-08-04) | POC: Medium | ND | **POC only, missing from trusted** | trusted set still "7 of 12 through July" |
| 5 | Windows of Attraction #9 Country Bear Jamboree (2026-09-01) | POC: Low | ND | **POC only** | Low confidence |
| 6 | Windows of Attraction #10 Enchanted Tiki Room (2026-10-13) | POC: Low; [eBay](https://www.ebay.com/itm/146565862079) | ND | **POC only** | needs official source |
| 7 | Enchanted Doors Jan 2026 (WDW LE 2500) | trusted source | ND | Trusted PHUK-00000076 | Name is month-only ("January 2026 – Enchanted Doors"), no subject/door named, so weak for search/scan |
| 8 | Enchanted Doors Jul 2026 | trusted source | ND | Trusted PHUK-00000082 | same naming weakness |
| 9 | Enchanted Doors Aug–Oct 2026 | not researched here | ND | **No** | INFERRED: 3 releases likely exist by 14 Oct; set count stale |
| 10 | Brush of Magic Mystery S1 Oswald (Disney Store, 2026-03-03) | POC High | ND | Trusted PHUK-00000631 | trusted scope "Disney Store" only; UK availability unverified |
| 11 | Brush of Magic Mystery S1 Stitch | POC High | ND | Trusted PHUK-00000632 | none |
| 12 | Brush of Magic Mystery S2 Simba (2026-06-16) | POC Medium | ND | **POC only** | — |
| 13 | Brush of Magic Mystery S3 Chernabog (2026-09-01) | POC High | ND | **POC only** | — |
| 14 | Brush of Magic LE Cinderella (LE 3,750, 2026-05-05) | POC High (official 3,750; one blog said 2,000) | ND | **POC only** | edition conflict in sources |
| 15 | Brush of Magic LE Sorcerer Mickey (LE 2,250 vs 3,750) | POC Medium | ND | **POC only** | edition conflict |
| 16 | Brush of Magic LE Darkwing Duck (3,750 vs 3,250) | POC Medium | ND | **POC only** | edition conflict |
| 17 | Animated Cuties S1 Alice (WDW Jan 2026; DS US May 2026) | [Disney Pins Blog](https://disneypinsblog.com/animated-cuties-mystery-pin-set-at-disney-parks) | ND | Trusted PHUK-00000331 | candidates CSV names it "…Blind Pack – 2-Pc." vs trusted "Alice"; no UK listing found in POC |
| 18 | Animated Cuties S2 (8 pins, MK Oct 2026) | POC Low (single fan source) | ND | **POC only** | needs confirmation |
| 19 | Toys in a Box: Figment (2025) | trusted (Pin&Pop-sourced) | ND | Trusted PHUK-00000056 | Retailer rows claim Disney Store UK/EU; set summary says WDW only; UK claim unsourced |
| 20 | Character Folding Fans: Stitch (2024) | trusted | ND | Trusted | Retailer rows include Disney Store UK; set says WDW; inconsistent |
| 21 | Mickey & Friends CNY 2025 mystery (12) | trusted | ND | Trusted | Retailer: Shanghai in rows vs "Disney Store" in set summary |
| 22 | Daring Detectives (WDW) Gadget Hackwrench, 2026 | trusted; [snippet](https://www.extramagicminutes.com/blog/disney-brush-of-magic-pin-series-collection-disney-store-2026) n/a | ND | Trusted PHUK-00000459 | none seen |
| 23 | Daring Detectives (DLR) set, 2026 | trusted | ND | Trusted | none seen |
| 24 | EPCOT Food & Wine 2025 mystery (10) | trusted | ND | Trusted | none seen |
| 25 | MVMCP 2025 mystery (8) | trusted | ND | Trusted | none seen |
| 26 | Dining with Disney 2025 (WDW monthly, LE 2,500) | [Disney Pins Blog](https://disneypinsblog.com/disney-parks-2025-monthly-pin-collections/) | ND | **No** | — |
| 27 | Disney Reflections 2025 (WDW AP, 12 × LE 1,500, $22.99) | same | ND | **No** | — |
| 28 | Disney Fairy Tale Moments 2025 (WDW, LE 2,500, $24.99) | same | ND | **No** | — |
| 29 | Disney Wondrous Worlds 2025 (WDW, 4 × LE 1,500, $34.99) | same | ND | **No** | — |
| 30 | DLP Pin Trading Night "Enchanted" (Sept 2026) | [LaughingPlace](https://www.laughingplace.com/disney-parks/dlp-pin-trading-nights-sept-2026/) | ND | **No** | event date inconsistent in source (17 vs 19 Sept) |
| 31 | Any DLP 2025–26 LE (e.g. anniversary/park LE) | not itemised here | ND (site search for "Disneyland Paris" returned 0 PinPal pages) | **No** (0 DLP rows in trusted) | — |
| 32 | Any Loungefly pin (e.g. Pixar Pop Art) | context only | ND (0 PinPal pages surfaced) | **No** | — |
| 33 | Any Artland (UK) pin | context only | ND (0 PinPal pages surfaced) | **No** | — |
| 34 | Hong Kong Disneyland "Elsa, Anna & Olaf — Frozen" OE 2026 | PinPal page | **Found** | **No** | can't cross-check; only 2026 PinPal record seen |
| 35 | WDI "Queen of Hearts — Adorbs" LE 300, 2021 | PinPal page | **Found** | **No** (pre-2024, out of trusted scope) | — |
| 36 | DEC "Blue Paint Jar" set (10 pins, 2024, Color Shades of Magic) | PinPal page | **Found** | **No** | — |
| 37 | "Disney Princess Cameo" set (4, 2024, origin "MII") | PinPal page | **Found** | **No** | origin code unexplained |
| 38 | "Minnie Mouse — Spotlight Tikis" LE 1000 | PinPal page | **Found** | **No** | — |

**Directional summary:**
- **PinPal has, we lack (VERIFIED for these specific records):** #34–38, i.e. older, US/HK and event-issuer (WDI/DEC) pins. That fits PinPal having broad historical depth, which our trusted catalogue intentionally doesn't attempt yet.
- **We have, PinPal not shown (ND, not proven absent):** all 2024–2026 mystery sets and the two 2026 monthly LE series in trusted.
- **Both appear to lack (INFERRED for PinPal, VERIFIED for us):** DLP 2025–26 releases, Loungefly, Artland and Disney Store UK–specific exclusives.

### Inferences
- INFERRED: Zero PinPal hits on "Disneyland Paris", Pin Trading Night, Loungefly and Artland, in a site-restricted index that still returns other PinPal pages, is a modest signal that PinPal's European coverage is thin or poorly indexed. Combined with USD marketplace pricing, PinPal looks US-focused. DLP/UK depth is the most defensible gap for PinHunt to own, but only if PinHunt fills it, because PinHunt's trusted catalogue currently also has zero DLP pins.
- INFERRED: Any PinPal pin-level errors couldn't be identified because no sampled 2025–26 record was readable. The data quality risks I'd test first on PinPal are the known source conflicts, where a single-source catalogue would likely pick one value silently: Brush of Magic edition sizes (2,250 vs 3,750; 3,750 vs 3,250; 3,750 vs 2,000), Windows of Attraction #5 subject, and the Enchanted Doors month subjects.
- INFERRED: PinHunt's most urgent catalogue freshness issue is internal, not competitive. Both "monthly" sets are frozen at July while it is mid-October, and 40-odd POC-researched 2026 pins (Brush of Magic LE/S2/S3, WoA #8–10, Cuties S2) are not live.

### Gaps
- No PinPal record for any of the 33 PinHunt-relevant samples (#1–33) could be checked, because of the network block plus thin search indexing. Recommended manual follow-up: in a normal browser, use thepinpal.com/explore to search "Windows of Attraction", "Enchanted Doors", "Brush of Magic", "Animated Cuties", "Pin Trading Night", "Disneyland Paris", "Loungefly", "Artland" and "Toys in a Box". Record per-pin name/year/edition/origin and compare with the table above. Read robots.txt and terms first.
- Enchanted Doors Aug–Oct 2026 subjects and DLP 2025–26 LE releases weren't researched pin-by-pin in this pass (official DLP/ED92/DLP Report pages weren't reachable within the tool budget). These need a dedicated research pass before claiming coverage.
- shopDisney UK availability for Toys in a Box, Character Folding Fans, Brush of Magic and Animated Cuties is unverified. The trusted rows assert UK/EU availability without a UK source.
- Couldn't determine whether PinPal shows market value/pricing per pin, or how its "approved records" moderation works.
