# Expanding the PinHunt catalogue: sources, gaps and a 30-day plan

_16 October 2026. Research only: no code changes, no imports, no Supabase changes, no outreach._
_No request of any kind went to Pin & Pop, PinPics or Stewpins, including their mirrors and caches._

## How this was researched, and its limits

**Evidence.** Four parallel research tracks: official and retail sources, fan and community sources, datasets and AI, and an internal repo audit.

**Network limits.** This environment's network policy blocked direct page fetches (403 or DNS errors) to almost every outside site. Terms and licence findings come from search-engine snippets of each site's own pages, with the URL given. Nothing marked "not verified" was read in full.

**robots.txt.** No robots.txt file could be read directly. A person needs to confirm each one before anything is automated. It takes about one minute per site.

**Legal status.** This is not legal advice. Anything rated "uncertain" should go to a UK IP solicitor before you build on it.

**Repo versus live database.** The repo is not the live database. The Collectible PinTrader (CTP) data you imported is not in the repo, so live counts below are inferred, and marked as such.

---

## 1. Summary

**1. The biggest unknown is your own live catalogue.** After 1 Sept 2026 the live catalogue is most likely the CTP "V2" import:
- 589 source groups, 502 auto-created as sets (`artifacts/api-server/scripts/import-collectible-pintrader.mjs`).
- The research engine checks duplicates only against the 182-row trusted workbook, not against CTP.
- So no one can currently say how many of our 871 research pins are already live, or how big the true gap is.
- **The first step costs nothing and takes one SQL export (§6, day 1).**

**2. No legitimate bulk shortcut exists.** No open Disney pin dataset exists:
- Nothing on GitHub, Hugging Face, Kaggle, Roboflow or Wikidata.
- The large catalogues (Disney Pinventory, PinTradingDB, apps claiming 120–150k pins) are proprietary or explicitly ban scraping.
- Disney's own terms and its **UK AI opt-out page** ban automated collection and any use in AI tools.
- The UK has **no commercial text-and-data-mining exception**. The government stepped back from one on 18 Mar 2026.
- A crawler-built catalogue is legally and reputationally the wrong bet.

**3. A hybrid can beat importing another big database, especially for UK and Paris:**
- the CTP base you already hold;
- **set-first discovery** from public release signals (fan blogs and news as leads only), confirmed against official pages by a person;
- a **monthly Disneyland Paris workflow**, where the US-centric databases are weakest;
- **collectors' own photos** as both the catalogue and the image set, through the scan → "Add this pin" funnel.

This hybrid is rights-clean, grows every month, and gives you images you are allowed to show. No imported database gives you that.

**4. Verification is the bottleneck, not discovery.** You already hold 871 candidate pins in 404 sets, and 0 have been checked by a person. A set-based "Set Board" (§5) cuts review from roughly 100 decisions per 100 pins to about 22 set decisions. The existing 404 sets become about 3 hours of review instead of 2 days.

**5. Two risks to clear early:**
- (a) **The 182 "trusted" pins are 100% sourced from Pin & Pop**: every row has a pinandpop.com source URL and a Pin & Pop ID (`attached_assets/PinHunt_UK_Trusted_Test_Catalogue_*.xlsx`). While their API decision is pending, check that this use matches whatever was agreed with Jenn and Chris.
- (b) **The CTP licence evidence is incomplete.** `.agents/memory/collectible-pintrader-rights.md` records a public CC export plus the developer's permission, but the licence variant and evidence fields are still TODO. The importer marks CTP images `public_display_allowed=true`.

---

## 2. Source-by-source scraping and licensing matrix

**Key to the matrix:**
- **Extract:** automated collection.
- **Facts:** storing individual facts (name, edition size, date, product code), which copyright does not protect.
- **Img-A:** analysing images internally (e.g. AI matching).
- **Img-D:** displaying images in the app.
- **P** = permitted, **X** = prohibited, **?** = uncertain.
- "Facts P" always means facts confirmed one by one and written in our own words, never a substantial copy of someone's database (UK database right, reg. 16).

### Official and licensees

| Source | Evidence (via search) | Data | Extract | Facts | Img-A | Img-D | Coverage 2020–26 (est.) | Way in |
|---|---|---|---|---|---|---|---|---|
| Disney Store UK / EU / US / AU (Salesforce stores; one 12-digit product ID across regions, e.g. 438018035187 on .co.uk/.eu/.it/.es) | Global ToU bans robots, spiders, data mining and AI use: https://disneytermsofuse.com/english/ ; UK AI opt-out reserves TDM rights: https://www.disney.co.uk/ai-opt-out ; Terms of Sale (personal use): https://support.disneystore.co.uk/hc/en-gb/articles/7059100392851 | Name, product ID, price, LE/LR, often edition size, series, set make-up ("6 to collect, 2 mystery") | **X** | **P** (checked by a person) | **X** | **X** | UK/EU ~150–300 new pin SKUs a year (~1,000–2,000 for 2020–26); about 80–90 live UK at a time; sold-out pages persist | Product ID as the cross-region key; a person checks; link out instead of copying images |
| Disney Store affiliate feed (CJ; .co.uk active since 08.05.2024 per directories) | https://www.affilitizer.com/programs/disneystore.co.uk , CJ feed docs https://developers.cj.com/docs/data-imports/product-feeds | Feed rows: title, ID, price, image, link | **P** once approved | **?** licence is for promotion only | **?** | **P** next to a tracked buy link (probably) | Current range only; history builds up over time | Apply; use as a **new-release radar**; get written OK before keeping data |
| Disneyland Paris site and newsroom | Legal: https://www.disneylandparis.com/en-usd/legal/legal-information-and-website-conditions ; press reuse non-commercial only: https://news.disneylandparis.com/en/terms-of-use/ ; **monthly release PDF linked from** https://www.disneylandparis.com/en-usd/events/disneyland-paris-pin-trading | Monthly LE/OE poster (dates, edition sizes, prices) | **X** | **P** (read by a person) | **X** | **X** | ~150–190 DLP pins a year; the poster covers ~90% | Monthly workflow (opportunity #4) |
| Disney Parks Blog / park pin pages | https://disneyparksblog.com/about/ (Disney ToU) | Announcements, event previews | **X** | **P** | **X** | **X** | Low to moderate, US-centric | Read by a person; cite as official |
| Loungefly / Funko | UK/EU terms ban scrapers and spiders: https://loungefly.com/gb/terms-and-conditions/funko-general-terms-and-conditions-english.html ; Awin programme 30617: https://ui.awin.com/merchant-profile/30617 | Name, SKU, set make-up, images | **X** (site) / **P** (feed, once approved) | **P** / **?** (Awin cl. 10.7 limits use to the agreement) | **?** | **P** next to a link | ~150–400 Disney pin SKUs a year | Awin feed as radar plus buy links |
| Hot Topic / BoxLunch | Official affiliate pages offer a product feed: https://www.boxlunch.com/customer-service/partnerships/affiliates/ | Feed | **P** once approved | **?** | **?** | **P** next to a link | Many US exclusives | Lower priority (US) |
| Pink a la Mode / Artland | https://www.pinkalamode.com/collections/disney (~23 Disney pins; editions of 150–1,000) | Small limited editions, numbered | Not verified (assume X) | **P** | **X** | **X** | ~20–60 a year each | **Ask the licensee directly** (a person does this). Strong mutual benefit |
| Primark / Zavvi / HMV | primark.com Disney page; Zavvi on Awin 2549 | Multipacks | not verified | **P** | **X** | **X** | Low | Skip |

### Fan, community and apps

| Source | Evidence | Data | Extract | Facts | Img-A | Img-D | Coverage (est.) | Relationship risk | Way in |
|---|---|---|---|---|---|---|---|---|---|
| **Disney Pins Blog** (Leaning Palm Amusements LLC, US) | Footer legal pages (not read); posts state edition, price and date, e.g. https://disneypinsblog.com/blogs/news/disneyland-paris-april-2026-pin-releases ; embeds official Disney images | Weekly US releases, monthly DLP, set lists, chasers; archive from 2020 | **?** → treat as **X** | **P** | **X** | **X** | 70–85% of US park and shopDisney LE/LR; good DLP | Low as a signal | **Headline and link radar only** (RSS not verified) |
| **PixieDustDLP / Mousesteps** | e.g. https://pixiedustdlp.com/2026/09/30/pin-trading-disneyland-paris-oct-2026/ , https://www.mousesteps.com/2026/09/01/disneyland-paris-september-2026-pins-revealed/ | Monthly DLP poster write-ups | **?** | **P** | **X** | **X** | ~90% of DLP park releases | Low | Early warning for the DLP workflow |
| MyPinCentral | https://mypincentral.com/ (Terms and Acceptable Use Policy not read; paid tiers) | Monthly WDW/DLR/DLP flyers with product codes | **?** (assume X) | **P** | **X** | **X** | High for flyer items | Medium | Signal only |
| WDWNT / LaughingPlace / ITM / AllEars | e.g. https://wdwnt.com/2025/05/full-list-with-prices-of-limited-edition-pins-coming-to-fall-2025-walt-disney-world-pin-trading-event/ | Full LE event lists with prices | **?** | **P** | **X** | **X** | High for US events | Low (WDWNT covers apps critically: press risk) | Signal only |
| **Hidden Mickey checklists** | https://hiddenmickeydisney.com/2025-wave-a-pins/ (downloadable .xlsx) | Hidden Disney sets with chasers and completers | **?** | **P** | **X** | **X** | High for Hidden Disney | Low | **Ask for a licence** (a person does this) |
| PinTradingDB | "57,179 pins and counting" (search snippet); no terms or API found; https://www.disneypinforum.com/threads/guide-to-pintradingdb-com.65615/ | Edition, dates, origin, price, SKU, "same release" | **?** → **X** | P (one-off) | ? | **X** | 30–45% (est.) | Medium (volunteer project) | Manual cross-check only; possible licence conversation |
| Disney Pinventory | Terms ban "any robot, spider, data miner, crawler, scraper"; licence is "personal, non-commercial" (search snippet of its terms) | ~90k pins; **has a Disney Store UK origin filter** | **X** | one-off only | **X** | **X** | 50–70% | High | Manual cross-check (current policy) |
| Disney Pin Forum | Users keep copyright; licence goes to the forum only: https://www.disneypinforum.com/help/terms/ ; 2026 release thread https://www.disneypinforum.com/threads/2026-pin-releases-discussion.80494/ | Release threads, directories | **X** | **P** | **X** | **X** | Broad but unstructured | **High** (core community) | Read by a person; build a transparent community presence later |
| Fandom pin wikis | CC BY-SA 3.0: https://www.fandom.com/Licensing | Very thin | P (share-alike) | P | ? | **X** | <5% | Low | Skip: share-alike would spread to the catalogue |
| Coleka (FR) | https://www.coleka.com/en/other-collections/pins/disney-disney-parks-pins_r19266 ("7209 items") | Checklist | **?** | **P** | **X** | **X** | Low to moderate | Low | Signal or manual use |
| Reddit | Data API terms need a commercial agreement for monetised use (secondary sources) | Anecdotal | **X** | **P** (manual) | **X** | **X** | Low | Medium | Manual |
| eBay | API licence (5 Sep 2025): temporary copies only; restrictions on AI use and restricted APIs | Live listings | Live use only | **X** for catalogue | Transient only | Live with link-back | n/a | Low | Keep to valuation (as now) |
| Etsy / Vinted / Mercari / Facebook | Meta Automated Data Collection Terms; Vinted bans bots | Listings, fakes | **X** | Manual | **X** | **X** | n/a | Medium | Skip |
| Competitor apps (Pin Trading – Scan & Collect "150,000+ pins", PinPal, MagicPin, ParkBound) | App Store listings; https://wdwnt.com/2026/09/third-party-pin-trading-app-blames-meta-for-ai-ad-altering-creators-likeness-following-85000-legal-demand/ | — | **X** | n/a | **X** | **X** | — | — | Competitors. Their scale shows a crowd-built catalogue can reach 100k+ |
| **Collectible PinTrader** (held) | https://collectiblepintrader.com/terms/ (submissions licensed to Collectible Apps "in perpetuity"); 2018 CC intent: https://www.disneypinforum.com/threads/collectible-pintrader-app-ios-and-android-for-tracking-trading.64812/ ; Android app unpublished 11 Jan 2025 | Community catalogue with images | n/a (held) | **?** until the evidence record is done | **?** | **?** (the importer sets display allowed) | 589 groups (live counts not in repo) | Low to medium | **Finish the rights evidence** (person); measure coverage |

### Datasets, search and AI

| Option | Evidence | Verdict |
|---|---|---|
| Public datasets (GitHub, Hugging Face, Kaggle, Roboflow, Zenodo) | e.g. `smyllet/DisneyPinsDataBase` (no licence, archived 2022); `pinpin0824/disney-pin-registry` (built "from eBay listings", so tainted) | None usable |
| Wikidata / Commons | Q5282490 (hobby only); Commons deletes photos of Disney-designed objects (derivative works) | Use CC0 IDs for characters, films and parks only |
| Google Custom Search API / Bing APIs / Google Lens | Custom Search closed to new customers, ends 1 Jan 2027; Bing retired 11 Aug 2025: https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement ; Lens has no API | Dead ends |
| Cloud Vision web detection (already in `scan.ts`) | Live | Use only as a transient lead: store the page URL and title for a person to check, never the matched images |
| Our own embeddings (DINOv2 for exact match, SigLIP for text) on **PinHunt-licensed images only** | Getty v Stability [2025] EWHC: model weights are not "infringing copies" (appeal pending); creating the copy still needs rights | Clean on our own and user-licensed images |

### UK legal notes that apply throughout

- **Copyright (CDPA 1988).** Facts are free. Text, photos and pin artwork are protected; pin artwork is Disney's.
- **s.29A text and data mining** covers non-commercial research only, so it does not cover PinHunt.
- **s.28A temporary copies** does not cover a stored matching index.
- **No commercial text-and-data-mining exception.** The government report of 18 Mar 2026 says "wait and see".
- **Database right (1997 Regulations, reg. 16).** Extracting a substantial part, or repeatedly and systematically taking small parts, can infringe.
  - It needs a UK-qualifying maker; US-made databases may not qualify since Brexit.
  - **Do not rely on that.** The sites' terms still bind as a contract, and the community reaction would cost more than the data.
- **Contract.** Clicking to accept terms (e.g. signing up) makes no-scraping clauses binding. Agents must never sign up anywhere.
- **EU / Disneyland Paris.** DSM Art. 4 allows commercial text and data mining unless it is reserved in machine-readable form. Treat Disney and DLP as reserved: Disney publishes an AI opt-out.
- **Images:** analysing, storing and displaying are three separate permissions (§4).

---

## 3. Gap analysis of the existing catalogue

| Layer | What we have (source) | Gap / unknown |
|---|---|---|
| **Live catalogue** | Most likely the CTP "V2" import (after 1 Sep 2026). 589 source groups; classifier 502 A-HIGH sets, 20 A-REVIEW, 29 B, 38 C. Images, external IDs and `pin_sets` + memberships for A-HIGH groups. (`import-collectible-pintrader.mjs`; `supabase/backup_catalogue_v1_2026-09-01.sql` froze V1 first) | **Pin count, line and year coverage not in the repo.** 87 non-A-HIGH groups were not made into sets. Phase 3 legacy reset: not known if it ran |
| Trusted catalogue | 182 pins / 18 sets, 2024–26 (2024: 26, 2025: 56, 2026: 100); Disney Parks 156, Disney Store 26; **0 Disneyland Paris**; 100% Pin & Pop-sourced | 86 of the 182 pinhunt_ids were reused for a different design (`docs/research/id-reuse-investigation/`) |
| V1 seed (archived) | 13,000 rows; 12,579 "AI expanded – speculative"; 0 images | Correctly archived. Not a source |
| Research candidates | 871 pins / 404 sets (DLP 340 pins and 232 sets; DSUK 181 and 46; WDW 165 and 83; DLR 108 and 34). 2023–26 only. Confidence High 148 / Med 363 / Low 358 | **0 checked by a person.** 30 conflicts, 36 possible duplicates. Duplicate check only against the 182 trusted pins |
| Set completeness (research) | 169 sets with a stated count: 122 complete, 47 incomplete | **236 known missing pins** in counted sets; 151 sets with pins but no count; 84 sets with neither |
| Images | CTP images (rights pending); contributed-photo pipeline live (migration 038) | Trusted and seed: 100% missing images |

**Estimated missing coverage.** These are lower bounds from research volumes; 2020–23 is extrapolated:

| Line | 2020–23 | 2024–26 | Notes |
|---|---|---|---|
| Disneyland Paris | **~600–750 pins missing** (no research yet) | ~340 named, ~500 implied; only CTP could cover them (unknown) | Our UK/Paris differentiator, and the weakest area in the US databases |
| Disney Store UK | **~350–550** | ~160–170 after duplicates removed; 73 known missing set members; Jan–Apr and Sep–Oct 2026 not researched | The product ID makes these the easiest to verify |
| WDW / DLR | Not researched | LE only: 273 pins; open-edition, mystery and festival releases not researched | Large, US-centric; CTP probably strongest here (unknown) |
| Licensees (Loungefly, Artland, Pink a la Mode) | Not researched | Not researched | ~200–500 a year combined |

---

## 4. Images: what each permission allows

| Image source | Analyse internally | Store copies | Display in app |
|---|---|---|---|
| Our users' photos, under an upload licence that covers analysis | **P** | **P** | **P** for the photo. Disney design copyright remains a residual, tolerated risk |
| Photos we take of pins we buy | **P** | **P** | **P** (same residual risk) |
| Affiliate feed images | **?** (needs written OK) | **?** | **P** only next to a tracked buy link while the product is live |
| Disney, DLP and licensee site images | **X** (ToU and AI opt-out) | **X** | **X** (link out instead) |
| Fan sites, eBay, forums, Reddit, Commons | **X** | **X** | **X** (eBay: live listing display with link-back only) |
| CTP images | **?** until the licence evidence is complete | **?** | **?** (the importer allows display; confirm) |

**Upload licence to add** (the existing draft is in `docs/research/catalogue-sprint/licensing-photos-open-data.md`):
- a grant to "analyse, extract data from, and create derived data (including feature vectors) to develop PinHunt's identification features";
- sub-licensing to the providers that process the images (OpenAI, Google);
- derived data and approved facts survive deletion of the photo;
- an optional CC BY opt-in;
- a UK GDPR notice: strip EXIF location data.

Have a solicitor review it.

---

## 5. Verification UX: the "Set Board"

**The problem.** Pin-by-pin review is too slow. Even the page-based Pin check still asks for one tick per pin and gives no view of the set.

**The idea.** The unit of review becomes the **set**. One screen per set:

```
┌ Ducks of Disney Mystery Pin Pouch · Disney Store UK · 2025 · mystery pouch · 16 pins ────────┐
│ Official page ↗  (product 438038208431)        Evidence: official ✓ · 2 news ✓                │
│                                                                                              │
│  [Baymax ✓] [Cheshire Cat ✓] [Daisy ✓] [Donald ✓] [Dumbo ✓] [Figment ✓] [Goofy ✓] [Marie ✓]  │
│  [Minnie ✓] [Nemo ✓] [Pluto ✓] [Powerline ✓] [Sorcerer Mickey ✓] [Stitch ✓] [Tigger ✓] [Tink ✓]│
│  16 / 16 found · 0 missing                                                                  │
│                                                                                              │
│  [ ✓ Approve whole set ]   [ Untick a pin ]   [ + Add a missing pin ]   [ Wrong set / skip ]  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**How it works:**
- **Tiles.** Each tile is one pin, all ticked by default. Clicking a tile unticks it ("not on this page").
- **Approve whole set** (key **A**) records one set-level check against the page and approves every ticked pin. Each pin still gets its own evidence and decision record, so the audit trail stays per pin. The existing set routes already support this (`/admin/research/sets/:runId/:setKey/direct-check` and `/decision`, #230).
- **Held pins are greyed out automatically**, so one click can never approve them. Held means possible duplicates, conflicts, or "one pin or separate pins" questions. Each held pin shows a one-line question inline.
- **Missing slots.** Where the expected count is known and pins are missing, dashed "?" tiles appear. Clicking one lets you type the character you can see on the checklist. That creates a **missing-pin task**: a candidate tied to this set and source, for research to complete.
- **Sorting.** Sets are queued with the most value first: official source, then complete, then larger sets.
- **Keyboard shortcuts:** A approve, U untick, M add missing, S skip, ← → move between sets. It also works on a phone.

**Time per set:**
- clean set: ~20–30 seconds;
- set with gaps: ~60–90 seconds;
- all 404 research sets: ~3 hours;
- the 22-set pilot: ~10 minutes.

**Where it lives:**
- **Now:** as a third mode of the local Pin check tool. Small change, no app release.
- **Later:** replaces the in-app Research Review screen, as a normal dev-agent issue with QA and security review.

This changes your earlier "no blanket approval" rule in one way: a single click now approves a set. The safeguards are per-pin evidence records, held pins excluded from bulk approval, and a check against an official page or your own photo.

---

## 6. Ranked top 10 opportunities

Scores run from 1 (worst) to 5 (best); for legal risk, 5 means lowest risk. Impact is the expected number of new or verified pins.

| # | Opportunity | Impact | Speed | Cost | Effort | Legal risk | Expected yield |
|---|---|---|---|---|---|---|---|
| 1 | **Measure the live catalogue** (one read-only SQL export of CTP pins, sets and external IDs). Re-run duplicate and gap checks against it | 5 (unlocks everything) | 5 (1 day) | 5 | 5 | 5 | True gap figures; stops duplicate work |
| 2 | **Set Board review of the existing 404 research sets**, then import to staging | 5 | 4 (2–3 weeks) | 5 | 4 | 5 | ~600–800 verified pins (after duplicates) |
| 3 | **Backfill 2020–23 with the existing research engine** (search-based discovery, sets first: DLP, then DSUK) | 5 | 4 | 5 | 4 | 4 (search results only; never fetches Disney pages) | ~1,000–1,300 candidate pins |
| 4 | **Monthly DLP workflow:** the official DLP release PDF read by a person, with PixieDustDLP / Mousesteps as early warning | 4 | 5 | 5 | 5 | 5 | ~150–190 pins a year; near-complete DLP |
| 5 | **Release radar:** headlines and links only from Disney Pins Blog, PixieDustDLP, Mousesteps, MyPinCentral and WDWNT; each confirmed officially before it becomes a set | 4 | 4 | 5 | 4 | 4 (after a person checks the feed and robots.txt) | ~300–600 new pins a year, live as released |
| 6 | **Scan → "Add this pin" funnel**, plus the upload licence, plus clustering of matching photos from different users | 5 (long term) | 2 (8–12 weeks) | 4 | 2 | 4 (needs solicitor-reviewed licence) | 3–6k distinct pins with photos over 6–12 months (est.) |
| 7 | **CTP: finish the rights evidence, then mine its 87 non-A-HIGH groups** and use its groups as the set frame | 4 | 4 | 5 | 4 | 3 (until the evidence is done) | Unknown, possibly hundreds of sets |
| 8 | **Affiliate feeds** (Disney Store UK/EU on CJ; Loungefly on Awin) as radar and buy links | 3 | 2 (approval) | 5 | 3 | 3 (purpose-limited licence) | DSUK and Loungefly new releases; revenue |
| 9 | **Buy and photograph DSUK sets** (barcode → product ID → set) | 3 | 4 | 2 (~£2–3k) | 4 | 5 | ~176 gold-standard pins with owned images; AI calibration set |
| 10 | **Licensing conversations, held by a person:** Hidden Mickey checklists, small licensees (Pink a la Mode, Artland), PinTradingDB, Coleka | 3 | 2 | 4 | 3 | 5 | Structured lists, images and goodwill |

**Ruled out:**
- crawling any Disney, DLP or licensee site, or its sitemaps;
- Disney Pinventory, Disney Pin Forum or Reddit/Meta automation;
- eBay as a catalogue source;
- Google Lens scrapers;
- mirrors or caches;
- Fandom text (share-alike);
- the tainted GitHub datasets;
- Pin & Pop, PinPics and Stewpins (per your instruction).

---

## 7. Challenging the current strategy

1. **Waiting for Pin & Pop is no longer the critical path.**
   - Opportunities 1–5 together reach roughly 2,000–3,000 confirmed, rights-clean pins in about 90 days, without them.
   - If Pin & Pop says yes, plug it in through the `PinRepository` seam as **enrichment** (IDs, images under their terms), not as the backbone.
   - You then negotiate from strength, and your catalogue doesn't depend on one partner.
2. **Stop researching pin by pin.** Make the **set** the unit you discover, verify and complete.
   - A set comes with its own count ("16 to collect").
   - A missing pin is then a visible, fillable gap, not an unknown unknown.
   - Your schema already supports this: `pin_sets` has `expected_pin_count`, plus memberships.
3. **Collectors are the moat, not another database.**
   - Every failed scan today is a lost catalogue entry and a lost image.
   - The iNaturalist and BrickLink pattern (failed match → submission; opt-in use of listing photos as reference images; "3 different collectors photographed this" auto-confidence) produces a catalogue no one can take away, and the image rights the others lack.
4. **Lead with UK and Paris.** The US-built databases are weakest exactly where your users are: DLP and Disney Store UK. The monthly DLP workflow plus Disney Store UK product IDs make PinHunt the reference for these within a quarter.
5. **Use AI to remove typing, never to verify.** Good uses:
   - extracting facts from your own photos of posters, cards and backstamps (the vision benchmark scored 108/108 fields on synthetic posters);
   - barcode → product ID lookups;
   - embeddings on licensed images to cluster unknown pins.

   A person always confirms. That is also what keeps you inside Disney's AI terms: you never feed Disney's content into AI, only your own and your users' photos.

---

## 8. 30-day action plan (without Pin & Pop)

| Days | Action | Who | Output |
|---|---|---|---|
| 1 | Run one read-only SQL export of live CTP pins and sets (I'll provide the query) and share the CSV | You (SQL editor) | Real catalogue baseline |
| 1–2 | Re-run duplicate and gap checks against CTP; rebuild the set workbook with an "in live catalogue" column | Claude (research branch) | True gap by line and year |
| 1–3 | Finish the CTP rights evidence (licence variant, permission email); check the trusted-182 Pin & Pop provenance against your agreement | You | Rights cleared or flagged |
| 2–4 | Add Set Board mode to the local Pin check (no app release) | Claude, after you approve | Set-level review |
| 3–7 | Review the 22 pilot sets (~10 min) and import to staging; then DSUK and DLP research sets | You + Set Board | First ~95 → ~500 verified pins on staging |
| 3–10 | Check feed URLs and robots.txt for 5 signal sites (5 minutes each) | You (in a browser) | Green light for the radar |
| 5–15 | Backfill the 2020–23 DLP sets, then DSUK, with the research engine (sets first, search-based) | Claude / Basil (supervised) | ~1,000 new candidates in sets |
| 7 | Start the monthly DLP poster routine (1st of each month) | You or a researcher | November 2026 DLP complete on release |
| 7–14 | Apply to the Disney Store CJ and Loungefly Awin affiliate programmes; ask the affiliate managers in writing whether facts can be kept | You | Feed access in about 2–4 weeks |
| 10–20 | Solicitor review: upload licence, displaying Disney designs in user photos, CTP licence | You + solicitor | Green light for funnel and images |
| 14–30 | Spec and build "Add this pin" from failed scans, plus a "missing pin" quest on incomplete sets (dev-agent issues, normal review) | Dev agent | Collector funnel live behind a flag |
| 20–30 | Buy the 2026 DSUK sets you lack (~£500 to start) and photograph them with cards and barcodes | You | Gold evidence + owned images + AI test set |
| 30 | Production go-live decision for verified pins | You | First public research-verified pins |

**Target by day 30:**
- 500–800 verified pins on staging;
- about 1,000 new candidates in 2020–26 sets;
- a monthly DLP routine running;
- the funnel and licence in build.

That would add roughly 1,500 pins in the first quarter, with the collector funnel compounding after that.

---

## Files

- **Set-first workbook:** `docs/research/catalogue-expansion/PinHunt_set_first_catalogue.xlsx`.
  - Sheets: README, Sets, Set_Members, Evidence, Coverage, Lookups.
  - Seeded with all 296 research sets and 871 pins as candidates (none verified).
  - Missing-pin and completeness formulas, coverage by line and year, and drop-down values.
- **This report:** `docs/research/catalogue-expansion/REPORT.md`.
- **Earlier related research** (not repeated here): `docs/research/catalogue-sprint/` (source-access, licensing-photos-open-data, direct-verification-plan, VISION-PROTOCOL), `docs/research/scan-independence/README.md`.
