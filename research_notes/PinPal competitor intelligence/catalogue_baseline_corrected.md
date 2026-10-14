# PinHunt catalogue baseline, corrected (for the PinPal comparison)

Research date: 2026-10-14. Read-only: no database or Supabase access, no env vars read, nothing applied. Repo HEAD `e3fe44a`.

Labels:
- **VERIFIED** means I read it in a repo file, a commit, or the output of my own local script over repo files. A citation is given.
- **INFERRED** means it is my reasoning from verified facts.
- **UNKNOWN** means only live database access can settle it.

This note corrects `catalogue.md` and `reports/PinPal competitor intelligence.md`. Both treated the 182-pin Trusted Test Catalogue as PinHunt's whole catalogue. That premise was wrong.

---

## 1. What PinHunt's catalogue actually is

### Takeaway
The live catalogue has gone through three generations, and the repo contains the data for only two of them:

1. **V0, the speculative seed.** 13,000 rows, imported around July 2026, now archived.
2. **V1, the Trusted Test Catalogue.** 182 pins, imported 2026-07-31 by overwriting seed rows in place. It was explicitly a stop-gap beta catalogue.
3. **V2, the Collectible PinTrader (CTP) export.** Imported into the live database around 2026-09-01. Code comments put it at about 3,000 browsable pins.

**The CTP data is not in the repo.** So the largest and most likely current part of the live catalogue cannot be inspected from here.

### Timeline (VERIFIED unless marked)

| Date | Event | Evidence |
|---|---|---|
| ≤ Jul 2026 | 13,000-row "Master Seed" loaded into `pins` | `supabase/migrations/037_catalogue_v2_provenance.sql` L135-136 ("0 of the 13,000 pins have a non-null import_batch_id"); `.agents/memory/trusted-catalogue.md` |
| 2026-07-31 20:59Z | Trusted import applied: `inserted 0, updated 182, matchedBy.pinhunt_id 182, archived 12818, remap.untouched 42` | `attached_assets/trusted-import-log-apply-1785531725282.json` |
| 2026-07-31 | Maintainer brief describes the trusted set as "a clean, reliable beta catalogue for testing PinHunt **while we wait for the Pin & Pop integration**" | `attached_assets/Pasted-Please-tidy-the-PinHunt-database-and-replace-the-curren_1785531306863.txt` |
| 2026-09-01 21:24Z | V1 backup ID snapshot: **13,000 pin ids and 18 set ids**. The 182 trusted pins are part of V1 because they reuse seed UUIDs. | `supabase/catalogue_v1_backup_2026_09_01_ids.json` (`capturedAt`); `supabase/backup_catalogue_v1_2026-09-01.sql` (expected `pins 13000 … pin_sets 18`) |
| 2026-09-01 | Migration 037 adds the `catalogue_sources` row `collectible_pintrader`, plus `is_legacy_v1` and `pin_set_memberships`. A separate "Phase 3 legacy reset" is meant to retire V1. That reset statement is **not in the repo**: it lives in a local plan file outside the repo. | `037_catalogue_v2_provenance.sql` L10-17, L159-163; `import-collectible-pintrader.mjs` L9-10 |
| 2026-09-01 21:41Z | Showcase admin account seeded with **127 `user_pins` rows, all CTP pins** (`catalogue_source='collectible_pintrader'`). This happened 17 minutes after the V1 snapshot. | `artifacts/api-server/scripts/showcase-seed-manifest-1788298904086.json` (`createdAt`, `rowIds` length 127); `seed-showcase-account.mjs` L5-6, L54-58 |
| 2026-09-05 | Commit `3fbc8ce` says the admin catalogue fetch "included **archived V1/eBay-image rows alongside the active V2 catalogue**". The fix filters to `is_searchable !== false / catalogue_status !== 'archived'`. | `git show 3fbc8ce` |
| 2026-09-05 | Commit `e43bf1f` checks in migration 037, the CTP importer/dry-run, the showcase seed and manifest, and the community rebuild script, all described as already used during "tonight's demo-readiness pass". `06a18b5` removes ad-hoc read-only scripts that queried `catalogue_source='collectible_pintrader'`. | `git show e43bf1f`, `git show 06a18b5^:artifacts/api-server/scripts/_find_pin_readonly3.mjs` |
| 2026-10-09/10 | Migration 039 adds a contributor view of "one row per searchable Collectible PinTrader pin". The "Browse Entire Catalogue" hook reads the whole browsable catalogue, described as **"≈3k rows"**. | `supabase/migrations/039_access_tiers_and_catalogue_contributions.sql` L153-206; `artifacts/pinhunt/hooks/useCatalogueBrowseIndex.ts` L8; `hooks/useCatalogueCoverage.ts` L7 |
| 2026-10-12 | The CTP importer was retargeted from `--env-file=.env` to `.env.staging`, with a `requireStaging()` guard. Before this date it ran against `.env`, the only project that existed then. | `git show 11a1123 -- artifacts/api-server/scripts/import-collectible-pintrader.mjs` |
| 2026-10-13/14 | Research engine, POC, pilot 28, migration 045 (staging tables), Research Review API/screen and the import dry-run are added. Their own docs state that nothing is imported. | `docs/research/catalogue-integration/README.md` L3; `05-pilot.md` L1, L42; `docs/research/research-import-design.md` L3 |

### Answers to the specific questions

- **Has the CTP / Catalogue V2 import been applied to the live database?**
  - INFERRED, with high confidence: **yes, around 2026-09-01, to the then-only (production) project.** Four pieces of evidence support this:
    - The 127 showcase rows reference real CTP pins.
    - Commit `3fbc8ce` refers to the "active V2 catalogue".
    - Migration 039 builds features over searchable CTP pins.
    - The importer used `.env` until 2026-10-12.
  - No apply log for the CTP import is committed. Only the trusted import has logs.
- **How many pins?**
  - INFERRED: **about 3,000 browsable pins** ("≈3k rows" in two hooks written on 2026-10-09/10).
  - The CTP export had **589 groups**, classified 502 / 20 / 29 / 38 (A-HIGH / A-REVIEW / B / C) (`import-collectible-pintrader.mjs` L89). The exact pin count is UNKNOWN.
  - New CTP pins were given `pinhunt_id`s by `max+1`, so they should start at about `PHUK-00013001` (`import-collectible-pintrader.mjs` L281; `docs/research/catalogue-integration/01-engine-review.md` L72). INFERRED.
  - CTP pins are written with `catalogue_status='active'`, `verification_status='verified'`, `is_searchable=true`, `catalogue_source='collectible_pintrader'`, and origin/park in the **`origin`** column (`import-collectible-pintrader.mjs` L286-305). Trusted pins carry `catalogue_status='trusted'` and park/retailer in **`retailer`** (`import-trusted-catalogue.mjs` L244).
- **Documented live, archived and trusted counts:**
  - VERIFIED, as of 2026-07-31: 182 trusted (searchable) and 12,818 archived (`is_searchable=false`). Total pins at 2026-09-01 was 13,000.
  - UNKNOWN: whether the Phase 3 legacy reset was run and also retired the 182 trusted pins. They are part of the V1 id snapshot, and 037 says V1 "will still be live/searchable" unless the reset runs.
  - The 2026-09-05 commit text ("archived V1 … alongside the active V2 catalogue") suggests V1 was archived. However, the app still has a "Verified catalogue pin" badge for `catalogueStatus==='trusted'`, and the Oct 13 research docs call the 182 "the catalogue the app serves today" (`docs/research/independent-catalogue-poc/README.md` L31; `docs/research/scan-independence/README.md` L91). Those docs were written without database access and did not account for V2. **They share the same error as the PinPal notes.**
- **Pending imports (VERIFIED: none imported):**
  - **Engine candidates:** 77 pins and 9 sets (`research/catalogue-engine/out/master_catalogue_candidates.csv`). These are 25 duplicates of trusted and 52 NEW. All are marked "Research candidate (not for import)".
  - **Staging payload:** `out/staging_payload.json` holds 86 candidates (pins and sets).
  - **Pilot:** 28 pins and 4 sets, 841 evidence rows (`docs/research/catalogue-integration/pilot_28_candidates.xlsx`, `pilot_staging_payload.json`). Status "prepared, NOT imported".
  - **POC:** 74 pins, of which 25 duplicate trusted and 49 are gaps (`docs/research/independent-catalogue-poc/PinHunt_Independent_Catalogue_POC_2026.xlsx`). Research only.
  - **Migration 045 staging tables:** "Never applied by an agent". Staging first. Whether a human applied them is UNKNOWN, and so are any rows in `catalogue_candidates`.

---

## 2. Best available local baseline (union of every local source)

Script: `/tmp/claude-0/-home-user-Pin-hunt-uk/9fc7a51f-594b-5ce8-a14e-6f19f164d58b/scratchpad/baseline.py`. Output: `.../scratchpad/baseline_union.csv`. It ran with `python3 -I` and pandas.

How the union was built:
- Seed rows whose `pinhunt_id` is in trusted were dropped, because the trusted import overwrote them in place.
- The three seed workbooks are identical in their shared columns (VERIFIED), so only the character-enriched copy is used.
- Park/retailer/brand/series text maps to origin buckets. A row can fall into more than one bucket (for example "WDW / DLR / Disney Store UK").

### Rows by source and status (VERIFIED)

| Source (file) | Status tag | Rows |
|---|---|---|
| Trusted Test Catalogue (`attached_assets/PinHunt_UK_Trusted_Test_Catalogue_1785531320477.xlsx`) | trusted. Imported 2026-07-31; current live status UNKNOWN (see §1) | **182** |
| Master Seed, not overwritten (`attached_assets/PinHunt_UK_Master_Seed_13000_Pins_Character_Enriched_1785155236773.xlsx`) | archived seed: speculative ("AI expanded") | 12,493 |
| | archived seed: "Source verified" | 179 |
| | archived seed: placeholders/queues ("Needs individual expansion" 54, "Needs visual verification" 58, "Needs source verification" 22, "Research queue" 12) | 146 |
| Template (`…Master_Pin_Catalogue_Template_Updated_1784488262605.xlsx`) | other: early template, superseded | 22 |
| POC (`docs/research/independent-catalogue-poc/…POC_2026.xlsx`, Pins) | POC: 49 gaps + 25 duplicates of trusted | 74 |
| Engine candidates (`research/catalogue-engine/out/master_catalogue_candidates.csv`) | 28 NEW in pilot, 24 NEW not in pilot, 25 duplicates of trusted | 77 |
| **Not in repo:** Collectible PinTrader V2 export | live and active (INFERRED) | **≈3,000 (INFERRED)** |
| `artifacts/pinhunt/mock-data/pins.ts`, `largeFixture.ts` | demo/mock only, never in a real build | excluded |

Deduplicated local union: 182 trusted + 12,818 archived seed + 52 NEW engine candidates ≈ **13,052 local rows**. The 49 POC gaps are contained in the engine's 52 NEW. **Only about 413 of these are non-speculative**: 182 trusted, 179 source-verified seed rows and 52 candidates. Placeholder rows are not individual pins. The live V2 (≈3k) cannot be added to this union because its data is not here.

### By origin, multi-label (VERIFIED from the script)

| Origin | Trusted 182 | Seed (all) | of which non-speculative seed | POC 74 | Engine 77 |
|---|---|---|---|---|---|
| DLP | **0** | 938 | 36 (5 source-verified DLP Pin Trading Time Jan 2025 pins + 31 monthly "release group" placeholders) | 0 | 0 |
| WDW (incl. EPCOT/MK) | 94 | 368 | 100 | 26 | 30 |
| Disneyland (CA) | 44 | 296 | 66 | 0 | 4 |
| Disney Store UK | 18 | 0 | 0 | 21 | 24 |
| Disney Store US / shopDisney | 0 | 133 | 51 | 56 | 56 |
| Disney Store (unspecified/EU/Asia/AU) | 82 | 914 | 12 | 0 | 0 |
| Loungefly | **0** | 1,023 | 3 | 0 | 0 |
| Artland | **0** | 1,083 | 46 (2026 "ArtLand / authorised retailers", source URL present) | 0 | 0 |
| HKDL | 0 | 0 | 0 | 0 | 0 |
| SHDR | 12 | 0 | 0 | 0 | 0 |
| TDR | 0 | 0 | 0 | 0 | 0 |
| Other (generic "Disney Parks", PALM, BoxLunch, Hot Topic, D23, WDI, DEC, MOG) | 0 | 8,315 | 57 | 0 | 0 |

### By release year (VERIFIED)

| Year | Trusted | Seed | POC | Engine |
|---|---|---|---|---|
| 2015-2023 | 0 | exactly 1,000 per year | 0 | 0 |
| 2024 | 26 | 1,364 | 0 | 0 |
| 2025 | 56 | 1,051 | 0 | 0 |
| 2026 | 100 | 1,403 | 74 | 74 (+3 undated Disney Classics London) |

Non-speculative 2025-26 rows by origin:
- **DLP:** 2025 = 17 (5 real pins + 12 monthly placeholders); 2026 = 19 (all monthly "pins" placeholders, e.g. "July 2026 – Phantom Manor pins").
- **Disney Store UK:** trusted 8 (2025); POC/engine 21-24 (2026).
- **Artland:** 46 (2026, seed source-verified).
- **Loungefly:** 3 (2026).

### Seed data quality: synthetic (VERIFIED)
- From 2015 to 2023, every retailer has exactly 76-77 rows per year, and "Disney Parks" has 154. In each year, 12 retailers × 77 rows plus Parks × 154 totals 1,000.
- Names follow a "{Character} {Theme}" grid ("Piglet Food", "Rex Park Icons", "Forky Stained Glass"). Series follow "DLP Exclusive {year}", "Retail Exclusive {year}" and "Fine Art {year}".
- DLP (938 rows): 902 are "AI expanded – speculative (Low)", 0 have a price, 5 have a date and 36 have a source URL.
- Loungefly: 969 rows with 0 source URLs.
- ArtLand (902 rows): 0 source URLs.
- The seed's README describes the same profile: 12,579 speculative rows, 261 "Source verified" and 0 images (`docs/research/independent-catalogue-poc/README.md` L35-42).
- **The seed is not coverage.** Its 179 source-verified rows plus 146 placeholders are the only salvageable research leads.

### What the live database probably holds that the repo does not (UNKNOWN, unverifiable here)
- About 3k CTP V2 pins, with `origin` values and groups (sets) from a 589-group export, plus CTP images (`pin_images.source='collectible_pintrader'`).
- The CTP group classifier has regexes for Hidden Mickey waves at `dlp|hkdl|tdl|tokyo|shanghai` and for `loungefly \w` groups (`import-collectible-pintrader.mjs` L114, L130). INFERRED, weak: this suggests the export contains some DLP, Asian-park and Loungefly groups. **Their counts and years are unknown.**
- Admin-corrected fields (`pin_change_audit`), user contributions (039), and any manually added pins or sets.

---

## 3. The 38-row sample, re-run against the full baseline

PinPal column, strictly reclassified:
- **P** = "PinPal: present (verified via search snippet)"
- **ND** = "PinPal: not determinable (network-blocked; absence of search results is NOT evidence of absence)"

**No row is "verified missing on PinPal".** Nothing in the earlier research proves absence. Direct fetches were blocked and the search index of thepinpal.com is thin.

"Live V2?" means: could this pin be in the live CTP V2 catalogue? It is always UNKNOWN from here. I note where it is plausible.

| # | Pin / set | PinHunt local (source / status) | Live V2? | PinPal |
|---|---|---|---|---|
| 1 | WoA #1 Haunted Mansion | Trusted PHUK-00000069; POC dup | UNKNOWN | ND |
| 2 | WoA #5 Tower of Terror | Trusted PHUK-00000073 ("Goofy"); POC + engine dup ("Twilight Zone…") | UNKNOWN | ND |
| 3 | WoA #7 Figment | Trusted PHUK-00000075; POC dup | UNKNOWN | ND |
| 4 | WoA #8 Buzz/Zurg | Engine NEW, **pilot 28**; POC gap | UNKNOWN | ND |
| 5 | WoA #9 Country Bear | Engine NEW, **pilot 28**; POC gap | UNKNOWN | ND |
| 6 | WoA #10 Tiki Room | Engine NEW, **pilot 28**; POC gap | UNKNOWN | ND |
| 7 | Enchanted Doors Jan 2026 | Trusted PHUK-00000076 | UNKNOWN | ND |
| 8 | Enchanted Doors Jul 2026 | Trusted PHUK-00000082 | UNKNOWN | ND |
| 9 | Enchanted Doors Aug-Oct 2026 | None in any local source | UNKNOWN (only if CTP export post-dates release) | ND |
| 10 | BoM Mystery S1 Oswald | Trusted PHUK-00000631; POC + engine dup | UNKNOWN | ND |
| 11 | BoM Mystery S1 Stitch | Trusted PHUK-00000632; POC + engine dup | UNKNOWN | ND |
| 12 | BoM Mystery S2 Simba | Engine NEW (not pilot); POC gap | UNKNOWN | ND |
| 13 | BoM Mystery S3 Chernabog | Engine NEW, **pilot 28**; POC gap | UNKNOWN | ND |
| 14 | BoM LE Cinderella | Engine NEW (not pilot); POC gap | UNKNOWN | ND |
| 15 | BoM LE Sorcerer Mickey | Engine NEW, **pilot 28** (PILOT-12); POC gap | UNKNOWN | ND |
| 16 | BoM LE Darkwing Duck | Engine NEW (not pilot, unnamed `brush-of-magic/limited-edition/darkwing-duck`); POC gap | UNKNOWN | ND |
| 17 | Animated Cuties S1 Alice | Trusted PHUK-00000331; POC + engine dup | UNKNOWN | ND |
| 18 | Animated Cuties S2 (8) | Engine NEW ×8 (not pilot); POC gap ×8 | UNKNOWN | ND |
| 19 | Toys in a Box Figment | Trusted PHUK-00000056 | UNKNOWN | ND |
| 20 | Character Folding Fans Stitch | Trusted PHUK-00000035 | UNKNOWN | ND |
| 21 | Mickey & Friends CNY 2025 (12) | Trusted PHUK-00000183… ×12 (SHDR) | UNKNOWN | ND |
| 22 | Daring Detectives WDW Gadget | Trusted PHUK-00000459 | UNKNOWN | ND |
| 23 | Daring Detectives DLR set | Trusted ×10 (PHUK-00000475…); seed has 7 archived speculative or placeholder rows for it | UNKNOWN | ND |
| 24 | EPCOT Food & Wine 2025 mystery | Trusted ×10 (PHUK-00000221…) | UNKNOWN | ND |
| 25 | MVMCP 2025 mystery | Trusted ×8 (PHUK-00000203…) | UNKNOWN | ND |
| 26 | Dining with Disney 2025 | None locally. Seed has only 12 "{Month} 2025 Wider Release Research Queue" placeholders (PHUK-00000270–281, archived) | UNKNOWN, plausible in CTP | ND |
| 27 | Disney Reflections 2025 | None locally | UNKNOWN, plausible | ND |
| 28 | Fairy Tale Moments 2025 | None locally | UNKNOWN, plausible | ND |
| 29 | Wondrous Worlds 2025 | None locally | UNKNOWN, plausible | ND |
| 30 | DLP Pin Trading Night "Enchanted" Sept 2026 | None locally. The closest are 5 archived source-verified DLP **Jan 2025** Pin Trading Time pins (PHUK-00000231–235): a different event | UNKNOWN | ND |
| 31 | Any DLP 2025-26 LE | Archived seed only: 5 real pins (Jan 2025 PTT), 31 monthly placeholders, 902 synthetic. 0 trusted, 0 research | UNKNOWN (CTP has `origin`; DLP depth unknown) | ND |
| 32 | Any Loungefly | Archived seed only: 969-1,023 synthetic (3 non-speculative 2026 rows). Pixar Pop Art: none | UNKNOWN (classifier hints at Loungefly groups) | ND |
| 33 | Any Artland | Archived seed only: 1,037 synthetic + **46 source-verified 2026 ArtLand rows** (archived, not live) | UNKNOWN | ND |
| 34 | HKDL Elsa, Anna & Olaf, Frozen OE 2026 | None locally (0 HKDL rows in any source) | UNKNOWN | **P** |
| 35 | WDI Queen of Hearts Adorbs LE 300 2021 | None locally. The only "adorbs" row is an unrelated D23 2026 S.E.A. aDorbs placeholder | UNKNOWN, plausible (classic US issuer) | **P** |
| 36 | DEC Blue Paint Jar set 2024 | None locally | UNKNOWN, plausible | **P** |
| 37 | Disney Princess Cameo set 2024 ("MII") | None locally. A seed PALM "Beauty and the Beast Cameo" row is a different item | UNKNOWN | **P** |
| 38 | Spotlight Tikis Minnie LE 1000 | None locally | UNKNOWN, plausible | **P** |

Corrections to the earlier table:
- (a) "PinHunt: No" for #26–38 meant "not in trusted, POC or candidates". It now reads "not in any local source; live V2 unknown".
- (b) The directional claim "PinPal has, we lack (VERIFIED)" for #34–38 is **downgraded**. What is VERIFIED is only that PinPal has them. Whether PinHunt lacks them is UNKNOWN, because they are exactly the older US/WDI/DEC material a CTP export would cover.
- (c) "Both appear to lack DLP/Loungefly/Artland … VERIFIED for us" is **retracted**. It holds for trusted and the research pipeline only.
- (d) Rows #4, #5, #6, #13 and #15 are pilot-28 candidates, not just "POC only".

---

## 4. The earlier claimed PinHunt gaps, re-assessed

| Earlier claim | Status now |
|---|---|
| "0 DLP pins" | **True only for trusted and the research pipeline** (VERIFIED). The archived seed has 938 DLP rows, but 902 are synthetic and none are live (`is_searchable=false`). For the live catalogue: **UNKNOWN**, since the CTP V2 `origin` distribution isn't in the repo. Don't state "zero DLP" externally. |
| "0 Loungefly / 0 Artland" | **True only for trusted and research** (VERIFIED). The seed rows are synthetic and archived. 46 real 2026 ArtLand rows exist, but only in the archived seed. Live: **UNKNOWN**. |
| "WoA and Enchanted Doors stuck at 7 of 12" | **True for the trusted rows and their `pin_sets` rows as imported** (VERIFIED from the Set Summary and the 2026-07-31 log). Live: **UNKNOWN**. The trusted sets may now be V1-legacy (hidden by `pin_sets_public_read … is_legacy_v1 = false`), or CTP may hold its own WoA/ED group. WoA #8–10 are prepared in the pilot but not imported (VERIFIED). ED Aug–Oct is not in any local source. |
| "2025 WDW monthly series (Dining with Disney, Reflections, Fairy Tale Moments, Wondrous Worlds) absent" | **True for every local source** (VERIFIED: only 12 archived "Research Queue" placeholders exist). Live: **UNKNOWN**. These are mainstream US releases that a CTP export dated after 2025 would plausibly include. |
| "Retailer scope conflicts" (CNY 2025, Folding Fans, Toys in a Box: rows vs set summary; unsourced UK claims) | **Still true as a data-quality issue in the trusted rows** (VERIFIED in the workbook). Whether those rows are still live, or were superseded by CTP equivalents, is **UNKNOWN**. |
| "182 pins / 18 sets is the PinHunt catalogue" (report table header, §Catalogue) | **Wrong.** At most, it is the V1 beta subset. Live is likely about 3k V2 CTP pins, possibly plus the 182 (INFERRED). |
| "PinHunt's trusted catalogue intentionally doesn't attempt historical depth" | Partly superseded. V2 CTP likely provides historical depth (INFERRED). How much is UNKNOWN. |
| Report P0 "Zero DLP pins undermines positioning" | Re-word as: "DLP depth in the live catalogue is unverified. The research pipeline and trusted set contain 0 DLP pins." |

Other earlier statements remain valid, because they do not depend on catalogue size: the method limitations, PinPal facts from snippets, the Brush of Magic edition conflicts, and the Enchanted Doors month-only naming.

---

## 5. What only live database access can settle (suggested read-only queries, NOT run)

Run these in the Supabase SQL editor (the postgres role bypasses RLS). Start each session with `set default_transaction_read_only = on;`, the same guard as `docs/research/id-reuse-investigation/impact_queries/*.sql`. Run on **production**, because staging has no data (`docs/research/catalogue-integration/README.md` L20).

```sql
set default_transaction_read_only = on;

-- Q1. Overall shape of the live catalogue
select catalogue_source, catalogue_status, is_searchable, is_legacy_v1, verification_status,
       (archived_at is not null) as archived, count(*)
from pins group by 1,2,3,4,5,6 order by 7 desc;

-- Q2. What the public actually sees (mirrors pins_public_read), by source
select coalesce(catalogue_source,'(null)') src, count(*)
from pins where verification_status = 'verified' and is_searchable
  and coalesce(catalogue_status,'active') <> 'archived'
group by 1;

-- Q3. Did the 182 trusted pins survive V2? (status of trusted rows)
select catalogue_status, is_searchable, is_legacy_v1, count(*)
from pins where catalogue_status = 'trusted'
group by 1,2,3;   -- 182 rows searchable = trusted still live; 0 rows = see the backup-join variant below

-- Q4. Origin buckets for the searchable catalogue (CTP uses origin, trusted uses retailer)
with s as (
  select lower(concat_ws(' ', origin, retailer, brand, collection, collection_name)) t, release_year
  from pins where verification_status='verified' and is_searchable
    and coalesce(catalogue_status,'active') <> 'archived')
select case
  when t ~ '(disneyland paris|\mdlp\M|disneyland resort paris)' then 'DLP'
  when t ~ 'loungefly' then 'Loungefly'
  when t ~ 'artland' then 'Artland'
  when t ~ '(hong kong|\mhkdl\M)' then 'HKDL'
  when t ~ '(shanghai|\mshdr\M)' then 'SHDR'
  when t ~ '(tokyo|\mtdr\M|\mtdl\M|\mtds\M)' then 'TDR'
  when t ~ '(disney store uk|disneystore\.co\.uk|\muk\M)' then 'Disney Store UK'
  when t ~ '(shopdisney|disney store|\mdsf\M|\mdssh\M|disneystore)' then 'Disney Store/shopDisney'
  when t ~ '(walt disney world|\mwdw\M|epcot|magic kingdom)' then 'WDW'
  when t ~ '(disneyland|\mdlr\M)' then 'Disneyland (CA)'
  else 'other' end bucket,
  count(*) total,
  count(*) filter (where release_year = 2025) y2025,
  count(*) filter (where release_year = 2026) y2026
from s group by 1 order by 2 desc;

-- Q5. Raw origin values (to refine Q4's mapping)
select origin, count(*) from pins
where catalogue_source = 'collectible_pintrader' group by 1 order by 2 desc limit 100;

-- Q6. Release-year distribution of the searchable catalogue
select release_year, count(*) from pins
where verification_status='verified' and is_searchable and coalesce(catalogue_status,'active') <> 'archived'
group by 1 order by 1;

-- Q7. When/how CTP was imported, and pinhunt_id range
select min(created_at), max(created_at), min(pinhunt_id), max(pinhunt_id), count(*)
from pins where catalogue_source = 'collectible_pintrader';
select id, filename, status, total_rows, inserted_rows, updated_rows, created_at
from import_batches order by created_at desc limit 20;

-- Q8. Sets: V1 vs V2, and the two monthly series
select catalogue_source, is_legacy_v1, count(*) from pin_sets group by 1,2;
select set_name, catalogue_source, is_legacy_v1, expected_pin_count, released_pin_count
from pin_sets where set_name ~* '(windows of attraction|enchanted doors)';

-- Q9. Pending research staging (only if migration 045 was applied)
select to_regclass('public.catalogue_candidates') is not null as has_045;
-- if true:
-- select status, record_confidence, count(*) from catalogue_candidates group by 1,2;

-- Q10. Sample lookups (the 38-row table); extend the pattern list as needed
select p.pinhunt_id, p.title, p.collection, p.origin, p.retailer, p.release_year,
       p.catalogue_source, p.catalogue_status, p.is_searchable
from pins p
where verification_status='verified' and is_searchable
  and coalesce(catalogue_status,'active') <> 'archived'
  and concat_ws(' ', title, collection, collection_name) ~* any (array[
    'windows of attraction','enchanted doors','brush of magic','animated cutie',
    'toys in a box','folding fan','chinese new year','daring detective','food (&|and) wine',
    'very merry','dining with disney','reflections','fairy ?tale moments','wondrous worlds',
    'pin trading (night|time)','loungefly','artland','adorbs','paint jar','princess cameo',
    'spotlight tiki','elsa.*olaf'])
order by collection, title;
```

Note on Q3: if the trusted rows were legacy-reset, their `catalogue_status` may have changed. Instead, match them against `supabase/catalogue_v1_backup_2026_09_01_ids.json` (V1 UUIDs), or against the `catalogue_v1_backup_2026_09_01.pins` schema if it was created:

```sql
select p.catalogue_status, p.is_searchable, p.is_legacy_v1, count(*)
from pins p join catalogue_v1_backup_2026_09_01.pins b on b.id = p.id
where b.catalogue_status = 'trusted' group by 1,2,3;
```

## Gaps
- The CTP export, its apply log, and the Phase 3 reset statement are not in the repo. The plan file is on the maintainer's machine. The live size (≈3k) comes from code comments, not a count.
- Whether the trusted 182 are still searchable is UNKNOWN (§1).
- PinPal per-pin presence for rows #1–33 still needs a normal browser, as before.
