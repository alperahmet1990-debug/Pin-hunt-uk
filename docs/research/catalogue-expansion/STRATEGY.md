# PinHunt: catalogue expansion strategy, 2020–2026

**Date:** 16 Oct 2026. **Status:** research and planning only.

Nothing in this work changed the app, Supabase, the catalogue, agents or tickets. Nothing was scraped and no one was contacted. No request of any kind went to Pin & Pop, PinPics or Stewpins.

## Files in this folder

| File | What it is |
|---|---|
| `STRATEGY.md` | This report. |
| `PinHunt_master_catalogue.xlsx` | Master workbook. Sheets: Sets, Pins (standalone and set members), Missing, Evidence, Coverage_Research, Coverage_Live (to fill), Sources and permissions, Lookups. |
| `live-catalogue-audit.sql` | Read-only SQL for you to run. Seven SELECT queries, tested against the real migration schema. |
| `ux-mockup.html` + `ux-*-ipad.png` / `ux-*-desktop.png` | Mock-up of the OE Review grid and Set Board. |
| `REPORT.md` | The first investigation, with full source-by-source legal notes. This report supersedes its projections. |

### How to read the labels

- **est.** means an estimate with a range. It is not a measurement.
- **unknown** means it can't be established without your input, usually the SQL results.
- **verified** means a person checked it against a direct source.
- Terms of use quoted here were read in the earlier research pass. **No robots.txt could be fetched from this environment** (outbound network is blocked), so every "robots" cell needs a one-minute check by a person in a browser.

---

## 1. Quantified audit

### 1a. What we can and can't count

| Layer | Where | Count | Confidence |
|---|---|---|---|
| **Live catalogue (Supabase production)** | Not readable from here; the agent guard blocks hosted Supabase | **unknown** | Run QUERY 1 |
| Collectible PinTrader (CTP) import | `artifacts/api-server/scripts/import-collectible-pintrader.mjs` | 589 source groups → 502 auto-sets (A-HIGH). Pin count is in the source file, which isn't in the repo | Repo counts **are not** live counts |
| Trusted catalogue | `attached_assets/PinHunt_UK_Trusted_Test_Catalogue_*.xlsx` | 182 pins / 18 sets, 2024–26 (2024: 26 · 2025: 56 · 2026: 100). Disney Parks 156, Disney Store 26, **0 DLP** | Repo file |
| Research candidates (staging payload) | `research/catalogue-engine/out/consolidated/` | 871 pins / 404 set records (143 distinct sets after consolidation). **0 checked by a person** | Repo |
| Images | `pin_images` | CTP images flagged public. Trusted and seed pins have 100% missing images | Live count unknown |

**The single most useful next step is for you to run QUERY 1** of `live-catalogue-audit.sql` in the Supabase SQL editor and send the CSV.

That one export fills the live columns of the coverage matrix: source × year × edition × set/standalone × image × status. It also lets every research candidate be deduplicated against CTP. Today the duplicate check runs only against the 182 trusted rows, which is the most important gap in the research engine.

### 1b. Coverage matrix: research layer (measured)

Pins in the research backlog, by line and year. "Official page" means a page a person can check the pin against.

| Line | 2020–22 | 2023 | 2024 | 2025 | 2026 | Total | Has official page |
|---|---|---|---|---|---|---|---|
| WDW | 0 | 19 | 32 | 49 | 38 | 165 (138 in classified years) | 4 |
| DLR | 0 | 17 | 26 | 47 | 16 | 108 | 17 |
| DLP | 0 | – | 67 | 144 | 129 | 340 | **0** |
| Disney Store UK | 0 | 1 | 51 | 78 | 92 | 181 | 201 rows across DSUK pages |
| Other | – | – | – | – | – | 77 | – |

By edition class:

| Line | OE | LE | LR | Mystery | Unknown |
|---|---|---|---|---|---|
| WDW | **0** | 100 | 36 | – | 28 |
| DLR | **0** | 88 | – | – | 20 |
| DLP | 112 | 151 | – | – | 77 |
| DSUK | – | 88 | 13 | 147 | – |

Standalone vs set member: 153 standalone, 718 set members. There are 103 known-missing set slots.

**What the matrix shows:**

1. **WDW and DLR open edition, your top two priorities, are essentially absent.** The US research pass collected LE releases only.
2. **2020–2022 is empty for every line.**
3. **DLP has 340 candidates but no official page to verify against.** It needs the monthly posters or PDFs, or photos.
4. Only ~220 pins across ~50 sets have an official page today. That is what a person can verify quickly now.

The `Coverage_Live` sheet in the workbook has the same layout, empty, ready for the QUERY 1 export.

### 1c. Provenance risks (reported only; no data was changed)

1. **The 182 trusted pins are 100% Pin & Pop-sourced.**
   - Every row carries a pinandpop.com source URL and a Pin & Pop ID.
   - Migrations seed `catalogue_sources.pin_and_pop` with `app_use_allowed`, `storage_allowed` and `public_display_allowed` all **false**.
   - If those rows are verified and searchable in production, the app is showing Pin & Pop-derived facts while the API decision is still pending.
   - The final query in the SQL file counts exactly this. **Please check it before the Jenn/Chris conversation.**
   - Separately, 86 of the 182 `pinhunt_id`s were previously found reused for a different design (`docs/research/id-reuse-investigation/`).
2. **The CTP licence evidence is incomplete.**
   - `.agents/memory/collectible-pintrader-rights.md` records a public Creative Commons export plus the developer's permission.
   - The *exact licence variant* and the *evidence record* are still TODO.
   - Even so, the importer sets CTP rows to `verified` and CTP images to `public_display_allowed = true`.
   - If the variant is NC or ND, public display inside an app with commercial intent, or cropping and resizing, could fall outside it.
   - **Fix by recording the licence variant and saving the permission email. No data change is needed if they support current use.**
3. **The research engine doesn't dedupe against CTP.** Expect a meaningful share of the 871 candidates to already be live. The share is unknown until QUERY 1.

---

## 2. Source and permissions matrix

The full matrix, with 17 routes, links, five permission verdicts and estimates, is in the workbook's **Sources** sheet. Legal detail is in `REPORT.md` §2. Summary:

- **Access** = a person may read it.
- **Extract** = automated collection.
- **Store** = keep facts in our database.
- **Analyse** = run AI or vision on its images.
- **Display** = show its images.

| Source | Access | Extract | Store facts | Analyse imgs | Display imgs | Use for |
|---|---|---|---|---|---|---|
| CTP (already held) | ✓ | ✓ | ✓ | ? | ? (variant TODO) | Baseline; dedupe key |
| shopDisney / Disney Store US | ✓ | ✗ (ToU: no robots or data mining, https://disneytermsofuse.com/english/) | ✓ checked one by one | ✗ | ✗ link only | OE and LE facts, 12-digit product number |
| Disney Store UK/EU | ✓ | ✗ (+ UK AI opt-out, https://www.disney.co.uk/ai-opt-out) | ✓ one by one | ✗ | ✗ | Sets, mystery make-up |
| DLP monthly PDF / posters | ✓ | ✗ | ✓ | own photo only | ✗ | DLP monthly LE/OE (https://www.disneylandparis.com/en-usd/events/disneyland-paris-pin-trading) |
| Disney Pins Blog | ✓ | ? terms and robots unchecked | ✓ own words, confirmed | ✗ | ✗ | **OE radar**: weekly and OE roundups |
| WDWNT / Laughing Place | ✓ | ? | ✓ confirmed | ✗ | ✗ | OE signals |
| Hidden Mickey checklists | ✓ | ? ask | ✓ facts | ✗ | ✗ | Hidden Disney waves (ask for xlsx) |
| Affiliate feeds (CJ Disney Store; Awin 30617 Loungefly) | after approval | ✓ feed | ? promo licence | ? | ✓ beside a buy link | New-release radar, licensees |
| Licensees direct (Loungefly, Artland, Pink a la Mode) | ✓ | ✗ (Funko EU terms) / ? | ✓ | ✗ | ✗ unless licensed | Licensee sets |
| Barcode DBs (UPCitemdb, Barcode Lookup, GS1) | ✓ | within plan | ? (Barcode Lookup: delete on exit) | ? | ? | Weak; Disney "4…" codes are in-store codes |
| Own / contributor photos (migration 038) | ✓ | ✓ | ✓ | ✓ with licence | ✓ with licence | **The only clean image route** |
| **PinTradingDB** | ✓ | ✗ without permission | one-off only | ✗ | ✗ | Licence enquiry only (≈57k pins) |
| **PinPal / Pin Trading App** (competitor apps) | – | ✗ | ✗ | ✗ | ✗ | Ruled out |
| **Disney Pin Forum** | ✓ | ✗ (https://www.disneypinforum.com/help/terms/) | manual one-off | ✗ | ✗ | Research leads only |
| Pin & Pop | **no contact** | – | – | – | – | Awaiting API decision |
| PinPics, Stewpins | – | ✗ | ✗ | ✗ | ✗ | Declined or reluctant |
| Pinventory, Reddit, Meta, eBay (as catalogue), Fandom, mirrors and caches | varies | ✗ | ✗ | ✗ | ✗ | Ruled out |

**UK legal frame (summary):**

- CDPA s.29A allows text and data mining for **non-commercial research only**. There is no commercial TDM exception; the 18 Mar 2026 government report kept the status quo.
- Database right (reg. 16) restricts extracting or reusing a *substantial part*.
- Site terms bind as contract.
- So: individual facts checked by a person and written in our own words are defensible. Bulk automated copying from any site, and any reuse of images, is not, without a licence.

---

## 3. OE-first (A) vs set-first (B)

| | **A: OE-first** (standalone rack pins) | **B: set-first** |
|---|---|---|
| Speed per verified pin | ~30–60 s with a grid, if a source is open (est.) | **~15–30 s per pin** where an official page lists the set (measured 4.3 pins per page in the pilot) |
| Volume available | **Large**: est. 5–15 new OE designs a week at WDW+DLR, est. 2,000–4,000 for 2020–26 | Smaller and lumpier; ~220 pins have an official page now |
| Quality / risk | Higher duplicate and re-release risk (same art, new year, new backstamp) | Lower; the set definition is itself evidence |
| Evidence | Weekly news posts (2 independent = OK), shopDisney pages, card photo with SKU | Official set page, checklist card, DLP poster |
| Images | None permitted from sources; needs contributor or own photos | Same |
| Legal | Low (facts, one by one) | Low |
| Effort to set up | Needs an OE research pass (none done yet) | Backlog ready now |
| Fit to your priorities | **Directly serves priorities 1 and 2 (WDW/DLR OE)** | Serves DLP and Disney Store (priorities 3 and 4) |

**Recommendation: run both, split by role rather than by line.**

- **Research capacity: ~70% A / 30% B.** OE is where the gap and your priorities are; the set backlog already exists.
- **Reviewer time: ~40% A / 60% B for the first 30 days.** Set Board pages give the most verified pins per minute, so verify them first while the OE pass builds. Move to 60/40 toward OE once the pilot measures OE minutes per pin.
- Standalone OE pins stay standalone (`record_type = standalone`). They are never forced into a set.

**Pilot (2 weeks, about 4–6 reviewer hours):**

| | |
|---|---|
| Scope | 50 WDW/DLR OE pins from 2025–26 + 10 Set Board sets (≈45 pins) |
| Measure | Minutes per verified pin; share with 2+ independent sources; duplicate rate against CTP; share with a usable image (contributor or own) |
| Go / no-go | A scales if it reaches ≤1 min per pin and ≤10% duplicates. Otherwise keep OE to pins with a shopDisney page or a card photo |
| Also | Photograph 5 physical OE cards to confirm the inference that the card barcode is the 12-digit Disney SKU |

---

## 4. Master workbook

`PinHunt_master_catalogue.xlsx` contains:

| Sheet | Contents |
|---|---|
| Sets | 143 sets: SET-id, line, year, type, expected vs known, missing (formula) |
| Pins | 871 rows: PIN-id, record_type standalone/set member, edition class, official page, evidence count, confidence, blocking flags, verification_status = unverified, image_status = none held, `in_live_catalogue` blank (to fill from QUERY 1) |
| Missing | 103 known-missing slots |
| Evidence | 740 evidence rows, source class kept separate (official / news / fan) |
| Coverage_Research | Live formulas |
| Coverage_Live | Empty template for the SQL export |
| Sources | The permissions matrix |
| Lookups | Drop-downs |

The workbook recalculates cleanly (0 formula errors). Facts and image rights are separate columns everywhere.

---

## 5. Verification UI proposal

See `ux-mockup.html` and the screenshots.

- **OE Review grid**
  - Filter chips: line, edition, week, "2+ independent sources", "possible duplicates".
  - Each card shows an image status (licensed contributor photo / own photo / "no permitted image, official photo is link only"), source chips and one **unticked** checkbox.
  - Duplicates are held with a Compare link.
- **Set Board**
  - One set per screen: "14 of 16 known · 2 missing · 3 you ticked".
  - Every tile starts unticked. Held tiles are red. Missing slots ask you to type what the checklist shows.
  - A side panel shows evidence, conflicts, "what you're confirming" and a separate image-rights note.
- **Rules built in**
  - Nothing is ticked by default.
  - Verify applies only to ticked pins, and untouched pins stay unverified.
  - "Send back with note".
  - Every tick is logged with reviewer and time (the existing `catalogue_research_evidence` and decision routes already record this).
  - Verifying facts never grants image rights.
- **Devices:** works at iPad landscape (1180 px) and desktop (1440 px). Keys: 1–9 tick, V verify, M add missing, → next.

---

## 6. Estimates per method

All figures are **estimates** of new pins checked by a person and usable in the catalogue, net of an assumed 20–40% overlap with CTP. The real overlap is unknown until QUERY 1.

| Method | 30 days | 90 days | Effort | Cost | Automation | Legal risk |
|---|---|---|---|---|---|---|
| Set Board on official-page backlog | 120–200 | 200–300 | ~1–2 min per page | £0 | medium | Low |
| OE pass: news roundups + shopDisney check | 60–150 | 400–800 | ~30–60 s per pin | £0 | medium (person reads) | Low |
| Disney Store UK sets and mystery | 40–100 | 150–300 | ~1–2 min per page | £0 | low | Low |
| DLP monthly (current months, posters or photos) | 15–30 | 50–90 | 20–40 min per month | £0 | low | Low |
| Hidden Disney (manual, or with Hidden Mickey permission) | 0–60 | 100–400 | Set Board per wave | £0 / attribution | high if permitted | Low |
| Physical purchase and photography | 30–60 | 100–200 | low | ~£500 to start | high (own photos) | Very low |
| Affiliate feeds | 0 | 50–200 | low | £0 | high | Medium until terms clear |
| Licensees direct | 0–30 | 50–200 | ~1 min per pin | £0 | low | Low |
| Scan → "Add this pin" (needs build) | 0 | 0–500 | low | build time | high | Low |
| Licensed dataset (PinTradingDB, Coleka; only if granted) | 0 | 0–2,000 | – | unknown | high | Low once licensed |
| **Total (excluding licence upside)** | **≈250–350** | **≈800–1,500** | | | | |

---

## 7. Challenging the earlier projections

| Earlier claim | Reality | Why |
|---|---|---|
| "404 sets in 3 hours" | **Wrong.** About 50 sets (~220 pins) can be checked quickly now | Only ~50 sets have an official page. DLP has 0. 404 was set *records* before consolidation (143 distinct sets), and the 3-hour figure assumed every set had a one-click source |
| "2,000–3,000 pins in 90 days" | **Too high** without a licensed dataset. A realistic figure is ≈800–1,500 | Reviewer minutes are the bottleneck, not discovery. A person must check every pin. Overlap with CTP is unmeasured. DLP and 2020–22 lack checkable sources |
| Research engine "dedupe" | Only against 182 trusted rows | Must dedupe against CTP before any count is meaningful |

The 2,000+ figure is only plausible if a licence (Hidden Mickey xlsx, PinTradingDB, Coleka) is granted, or if the scan funnel reaches meaningful users. Treat both as upside, not plan.

---

## 8. 30-day and 90-day plans

### Days 1–30

| Days | Action | Who | Output |
|---|---|---|---|
| 1 | Run QUERY 1 (and the trusted-provenance query) and send the CSV | You, 5 min | Live baseline, dedupe key, Pin & Pop exposure count |
| 1–3 | Record the CTP licence variant and save the permission email | You | Rights evidence closed |
| 2–5 | Check terms and robots.txt for Disney Pins Blog, WDWNT, Laughing Place, Hidden Mickey (1 min each, in a browser) | You | Green or red light per signal source |
| 3–7 | OE research pass: WDW+DLR OE 2025–26 from roundups, written as candidates (facts in own words, links kept) | Claude (research engine, after your go) | est. 300–500 OE candidates |
| 3–14 | **Pilot**: 50 OE + 10 sets in the grid or board (staging Research Review is the existing tool until the new UI is built) | You, 4–6 h | Measured minutes per pin, duplicate rate |
| 5 | Buy and photograph ~10 OE cards and 2 Disney Store UK sets | You, ~£150–200 | SKU inference confirmed; own images |
| 7 | Ask Hidden Mickey for permission to use the checklist xlsx (a person asks, with attribution offered) | You | Possible 400–550 Hidden Disney pins |
| 10 | Apply for the CJ Disney Store and Awin Loungefly programmes | You | Feeds in ~4–8 weeks |
| 15–30 | Verify official-page sets, then OE in weekly batches; import via the existing research import (#241, non-public until reviewed) | You (~2 h a week) | **≈250–350 verified pins** |

### Days 31–90

- Build the OE Review grid and Set Board, once you approve a ticket (none created here).
- Extend OE back to 2023–24, then 2020–22 using archived news posts.
- DLP: photograph posters monthly; ask DLP pin trading for past PDFs.
- Ingest the affiliate feed as a radar if approved, and licensee sets.
- Scope the scan → "Add this pin" barcode funnel.
- Target: **≈800–1,500 verified** (est.).

---

## 9. Recommendation

**The fastest, most practical and legally defensible way to add the largest number of accurate, usable Disney pins in the next 30 days, without Pin & Pop:**

> **Measure what CTP already gives you, then have a person verify facts from official and news sources, one pin at a time, in a batch UI that never ticks for you, putting official-page sets first and WDW/DLR open editions second.**

1. **Today:** run QUERY 1. Without it every number here is a guess, and some research candidates are certainly already live.
2. **This week:** close the CTP licence evidence, and check the trusted-182 Pin & Pop exposure.
3. **Weeks 1–2:**
   - Verify the ~50 official-page sets (≈150–200 pins, fastest per minute).
   - In parallel, run the OE research pass for WDW/DLR 2025–26.
   - Run the 2-week pilot to measure OE speed.
4. **Weeks 3–4:** verify OE pins with 2 independent sources or a shopDisney page. Images come only from your own or licensed contributor photos. Start a small physical-card purchase to get both images and SKUs.
5. Send three permission asks (Hidden Mickey, CJ, Awin). These are the only routes to 2,000+ and they cost nothing to try.

**Realistic outcome (estimate):** ≈250–350 new verified pins in 30 days, and ≈800–1,500 in 90 days. Upside comes only from licences or the scan funnel.

This plan involves no scraping, no Pin & Pop, PinPics or Stewpins, no images reused from sources, and no auto-approval.
