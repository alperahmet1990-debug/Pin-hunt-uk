# Independent Disney Pin Catalogue — Research POC (Oct 2026)

**Status:** research only. Nothing here has been imported. The app, the database, the existing catalogues and the agent workflows are unchanged.

**Deliverables**
- `PinHunt_Independent_Catalogue_POC_2026.xlsx`: research catalogue with 9 sheets:
  - README
  - Pins
  - Sets
  - Set Relationships
  - Sources
  - Comparison
  - Existing-only rows
  - Missing Info
  - Existing Catalogue
- `raw/research_*.json`: field-level research notes for each set, plus every URL consulted and whether it could be read.

**Rules followed**
- Pin & Pop, PinPics and PinTradingDB were excluded as evidence.
- No images or descriptions were copied. Facts are paraphrased.

> **Key limitation.** This environment's network policy refused direct page reads for every site tried, including disneystore.com and .co.uk, wdwnt.com, disneypinsblog.com, wdwinfo.com and extramagicminutes.com. All facts came from search-engine summaries of those pages, and nothing was worked around. "High" confidence means an official Disney Store page is cited as listing the pin, not that a person read the page. Re-check before any import.

---

## 1. What we currently have

| Asset | Size | Source | Reality |
|---|---|---|---|
| Master Seed workbook (`attached_assets/…Master_Seed_13000_Pins*.xlsx`; 2 identical copies plus a character-enriched variant) | 13,000 rows, 243 series | AI/mass-generated | See breakdown below. |
| Trusted Test Catalogue (`…Trusted_Test_Catalogue…xlsx`) | 182 pins, 18 sets, 2024–2026 | **100% pinandpop.com** | Every row has a Pin & Pop id and a pinandpop.com source URL. This is the catalogue the app serves today. |
| Catalogue V2 (Collectible PinTrader export) | Not in repo | CTP export + permission | Importer and dry-run scripts exist. The rights record (migration 037) has its CC licence variant "pending confirmation" and its evidence fields unfilled. Size can't be assessed read-only. |
| Master Catalogue Template | 999 rows | Earlier subset of the seed | Superseded. |

**Master Seed breakdown**
- 12,579 rows are labelled "AI expanded – speculative", and 11,721 of those are "Seed" launch records.
- 2015–2023 contains exactly 1,000 rows per year, which points to synthetic data.
- Only 261 rows are "Source verified".
- 8.8% of rows have a source URL: 733 disneypinsblog.com, 143 pinandpop.com, 142 laughingplace.com.
- Release dates 0.4%, prices 2.1%, images 0%.
- 2,704 rows duplicate a name+series pair.
- The seed is archived and not searchable in Supabase.

**External dependencies today**
- **Pin & Pop:** the trusted catalogue's only source, plus `external_identifiers.pin_and_pop`. Admin-only reference images and links (migration 042, `getPinAndPopReferences`).
- **PinPics / PinTradingDB:** match keys in the Collectible PinTrader dry-run.
- **Collectible PinTrader:** Catalogue V2 data and images.
- The app makes no runtime API calls to any catalogue provider. The dependency is in the data and its provenance.

**Data-integrity finding (not acted on):** the trusted import reused 25 seed `pinhunt_id`s for different designs.
- `PHUK-00000331` was "Mickey Mouse – Animated Cutie" in the seed and is now "Alice".
- `PHUK-00000625` was "Mickey Paintbrush" and is now "Dopey".
- This breaks the "permanent identifier" rule in the seed README. Any `user_pins` that pointed at those UUIDs before the import now point at a different pin. This is worth checking separately.

## 2. How many pins were independently verified

**74 individual pins** were recorded across 7 sets and sub-sets in 3 families. **61 are independently verified (22 High, 39 Medium); 13 are Low.**

| Set | Found | High | Med | Low | In trusted catalogue |
|---|---|---|---|---|---|
| Animated Cuties S1 (8 designs) | 8/8 | 8 | – | – | 8 (all matched) |
| Animated Cuties S2 (8 designs, Oct 2026) | 8/8 | – | – | 8 | 0 |
| Windows of Attraction 2026 WDW (12 monthly LE 2,500) | 10/12 (Nov/Dec not out) | – | 7 | 3 | 7 (all matched) |
| Brush of Magic LE singles | 18 | 4 | 12 | 2 | 0 |
| Brush of Magic Mystery S1 / S2 / S3 (10 each) | 30/30 | 10 | 18 | 2 | 10 (S1 only) |

**Duplicates:** all 25 trusted rows for these sets were independently re-found, giving 25 duplicates. One spelling issue: research found "Todd", but the trusted row's "Tod" is correct.

**Gaps:** 49 researched pins are not in the trusted catalogue:
- Brush of Magic LE singles: 18
- Brush of Magic Mystery S2: 10
- Brush of Magic Mystery S3: 10
- Animated Cuties S2: 8
- Windows of Attraction #8–#10: 3

The 2025 Disneyland Windows of Attraction series (12 + 4 completers) is missing from both catalogues.

**Seed accuracy check:**
- **Animated Cuties:** none of the seed's 32 invented "Animated Cutie" rows matches a real Series 1 design. Only Ariel appears, and only in Series 2.
- **Brush of Magic:** 4 of the 24 invented "Paintbrush" rows match real Series 1 designs.
- **Conclusion:** speculative AI expansion is not a usable catalogue source.

## 3. What information was missing (see the *Missing Info* sheet)

- **Per-pin product codes / SKUs:** 4% of pins have one. Disney sells mystery pins by box code, not by pin.
- **Official source:** only 30% of pins have one. No official page was found for any 2026 Windows of Attraction pin.
- **UK availability or GBP price:** 42% of pins. It exists only for Brush of Magic items on disneystore.co.uk.
- **Disneyland Paris release:** none of the three sets has one.
- **Set position numbers:** 14% of pins, Windows of Attraction only.
- **Exact release day:** 76% of pins. Animated Cuties S1 is month-only in research; the trusted file has 2026-01-13.
- **Back-stamp, physical description, our own images:** 0% for all three.
- **Conflicts:**
  - Brush of Magic edition sizes disagree on 4 pins.
  - Release dates disagree on 2 pins: Hades and Gadget.
- **Unverified characters:** characters on 6 of the 10 Windows of Attraction pins.
- **Single-source sets:** Animated Cuties S2 rests on one fan blog.

## 4. Can this scale to thousands of pins?

**Yes for new releases going forward, but not as a one-off scrape, and not for the back catalogue without contributions from collectors.**

- **Throughput:** about 75 pins took roughly 10 minutes of parallel agent time (about 90 searches), even with page reads blocked. With pages readable and a review queue, keeping up with a few hundred new Disney pins a month is realistic.
- **Quality ceiling:** fan and news blogs are what make Medium confidence possible. Disney's own pages are often thin, short-lived (listings disappear after sell-out) and per-box rather than per-pin. Expect most rows to settle at Medium unless they are backed by a photo of the physical pin.
- **Back catalogue (pre-2025):** official pages have mostly gone. The independent route there is collector-contributed photos and back-stamps (the existing `contribute` flow), not web research.
- **Terms and access:** automated fetching of disneystore.com and similar sites needs a terms-of-service and robots review before it becomes a pipeline. A human-in-the-loop "assisted research" mode is the safer default.

## 5. Recommended architecture and next steps

Keep the **Master Catalogue as the single canonical record** and put research in front of it as a staging layer. This is *not* a replacement catalogue: it feeds the existing `pins` / `pin_sets` / `PinRepository` path. Pin & Pop plans should be checked before building, per CLAUDE.md.

```
Discovery  →  Evidence capture  →  Claims & reconciliation  →  Review queue  →  Master Catalogue
(official      (URL, fetched_at,     (one row per field per       (admin UI;        (stable, never-reused
 new-pin lists, page hash, extracted   source; confidence rules     accept/merge/     pinhunt_id; sets as
 Parks Blog,    facts — no images/     from this POC; conflicts     reject)           first-class rows)
 DLP, news RSS) copied text)           flagged, never auto-merged)
                                                                         ▲
                                     Collector photos / back-stamps (existing contribute flow)
```

- **Reuse what exists:**
  - `catalogue_sources`: add a row per evidence source.
  - `pin_external_ids`: store Disney Store pack and product codes.
  - `pin_set_memberships`: many-to-many sets.
  - The existing importer patterns: dry-run first, idempotent.
- **New, proposal only:** a staging `catalogue_claims` table (pin candidate, field, value, source, fetched_at, confidence). Pins are promoted only after review. This would be a new hand-written migration and needs explicit approval.
- **Identity rule:** mint new `pinhunt_id`s and never repurpose old ones. Sub-series get their own set rows (e.g. Brush of Magic → LE / Mystery S1–S3). Record name collisions explicitly, such as the PALM "Ink and Paint Brush of Magic" set.

**Next steps (for you to approve)**
1. **Network access:** allow the research hosts in this environment's network settings (Disney Store US/UK/EU, disneyparks.disney.go.com, disneylandparis.com, wdwnt.com, disneypinsblog.com, laughingplace.com). Then re-run this POC with direct page reads to confirm the 22 High and 39 Medium rows.
2. **Terms review:** review the terms and robots rules of the Disney Store and the main blogs, and decide between manual-assisted and automated fetching.
3. **Promote the gaps:** decide whether the 49 gap pins should go through a dry-run import into the Master Catalogue once re-verified.
4. **ID reuse:** investigate the `pinhunt_id` reuse finding and the effect on `user_pins`.
5. **Pilot:** run one month of new releases end-to-end (Nov 2026: WDW Pin of the Month, Disney Store drops, DLP) to measure real effort per pin.
