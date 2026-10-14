# PinHunt catalogue research engine (prototype)

An offline, evidence-first pipeline that turns public-source research into reviewable Master Catalogue candidates.

**Isolation**
- It **never** touches Supabase, the app, the scan pipeline or the agent workflows.
- It never mints or reuses `pinhunt_id`s.
- Every output row is inert. `Import action = RESEARCH-*`, `Catalogue status = Research candidate`, `Safe for app search = No`. The existing `import-trusted-catalogue.mjs` only takes `UPSERT` + `Trusted test record` + `Safe = Yes`, so it ignores these rows.
- Python 3 standard library + pandas/openpyxl. Not part of the pnpm workspace.

```
collectors (research agents · live fetcher · physical-pin capture)
        │  evidence packets (EVIDENCE_PACKET_SPEC.md): one claim = one fact, one field, one source
        ▼
load.py        validate fields/methods, apply source policy (sources.py), reject excluded/marketplace/URL-less claims
reconcile.py   per field: group equal values, count independent publishers, classify official/news/fan,
               confidence ladder, conflict vs variant vs regional variant, set inheritance, set completeness
dedupe.py      match against the live trusted Master Catalogue (product code → set+character → set+name → fuzzy)
export.py      Excel review workbook · Master-Catalogue-shaped CSV · records_with_evidence.json
audit.py       proves every populated value traces to evidence (exit 1 otherwise)
fetch.py       polite live fetcher: allowlist + robots.txt + rate limit + JSON-LD facts only (blocked in this env)
```

## Rules the engine enforces

**Never invent**
- A value appears only if an accepted claim states it.
- Unevidenced values are withheld: `editorial` (general knowledge) and `legacy_record` (first-POC record-level attribution) claims are shown as alternatives only.
- Missing set members are reported (`incomplete 10/12`), never created.
- `audit.py` checks a whole run.

**Source policy**
- **Excluded:** Pin & Pop, PinPics, PinTradingDB.
- **Not evidence:** marketplaces.
- **Publisher classes:** official (Disney Store / Parks / DLP), news, fan.
- **One vote per publisher:** subdomains collapse, so three Disney Pins Blog posts count once.

**Confidence ladder** (per field)

| Level | Rule |
|---|---|
| High | official + ≥1 independent publisher, or an official page read directly, or a physical pin |
| Medium | ≥2 independent publishers, or official alone |
| Low | one publisher |
| Unverified | no evidence |

**Identity confidence** pools every claim that names the pin (characters, attraction, retailer title).

**Disagreement handling**
- *Conflicts* on identity fields (characters, attraction, edition size or type, chaser, set size) **block** sign-off.
- Elsewhere, disagreement is a *variant* and only produces a warning: retailer titles, store vs park dates, prices.
- Different official markets give *regional variants*, e.g. `US: 438030741301 | Asia/EU: 438030755384`.

**Verified pin** = identity High/Medium, from ≥1 non-legacy source, with no blocking conflict.

## Run

```bash
cd research/catalogue-engine
python3 -m unittest discover -s tests                   # 21 tests
python3 -m engine "evidence/*.json" --out out           # full run
python3 -m engine.audit out/records_with_evidence.json  # no-invention audit
python3 bench.py 5000                                   # scale benchmark (synthetic)
python3 -m engine.legacy <poc raw dir> evidence/pin_keys_v1.json evidence/00_poc_v0_legacy.json
```

## Outputs (`out/`)

**`catalogue_research_output.xlsx`** sheets:

| Sheet | Contents |
|---|---|
| Summary | Run totals |
| Review Queue | Records that need a human |
| Master Catalogue | Live trusted-catalogue columns, plus research columns |
| Sets | Completeness per set |
| Duplicates | Matches against the existing catalogue |
| Field Evidence | Value, confidence, publishers and alternatives per field |
| Claims | Every accepted claim |
| Rejected Claims | Claims refused, with the reason |
| Sources | Sources used |
| Gaps | Searched-but-not-found entries |
| Packets | Input packets |

**Other files**
- `master_catalogue_candidates.csv`: same rows, import-shaped but inert.
- `records_with_evidence.json`: every field with its claim IDs, URLs and methods.

## Evidence in this run (`evidence/`)

| Packet | Content |
|---|---|
| `00_poc_v0_legacy.json` | First POC converted. Shown, never counted. |
| `10_animated_cuties.json`, `11_windows_of_attraction.json`, `12_brush_of_magic.json` | Field-level re-research of the 74 POC pins |
| `20_new_set_disney_classics_london.json` | New set: Disney Store UK "Disney Classics London" 3-pin set |
| `30_corroboration.json` | Second-publisher pass for single-source pins |

## Known limits

- **All research claims are `search_snippet`.** This environment's network policy blocks page reads, so the live fetcher cannot run here. Snippets can mis-summarise a page.
- **Snippet-sourced roster claims are attributed per pin.** When a source lists a whole set, every pin gets a claim from it. This is correct for checklists, but a reviewer should spot-check.
- **Visual descriptors are thin.** Sources describe series-level construction, not per-pin colours or poses. Our own photos are the real fix.
- **Duplicate detection is rule-based.** It is tuned to the current 182-row catalogue's naming and will need embeddings or a learned matcher at 10k+ rows.

## Results of the 13 Oct 2026 run

**Inputs:** 6 packets, 2,375 accepted claims, 4 rejected (bare home-page URLs), 83 distinct sources. Every claim is `search_snippet`; no pages could be read.

**Pins:** 77 (the 74 POC pins plus 3 new). Record confidence: High 34, Medium 18, Low 25, Unverified 0.

**Verified: 48**
- 32 High, 16 Medium.
- 20 duplicate pins already in the trusted catalogue, independently re-verified.
- 28 not yet in our catalogue.

| Group | Verified |
|---|---|
| Animated Cuties S1 | 8/8 |
| Brush of Magic Mystery S1 | 10/10 |
| Brush of Magic Mystery S3 | 10/10 |
| Brush of Magic LE singles | 12/18 |
| Windows of Attraction 2026 | 5/10 |
| Disney Classics London | 3/3 |

**Not verified: 29**
- Identity rests on one publisher for 25:
  - Animated Cuties S2 (8) and Brush of Magic Mystery S2 (10): Disney Pins Blog only.
  - Windows of Attraction (5).
  - Brush of Magic Ariel and Captain Hook (2).
- Blocking edition-size conflicts for 4 Brush of Magic LE pins: Aladdin, Cinderella, Darkwing Duck, Hercules.

**Duplicates**
- 25 found against the live trusted catalogue: Animated Cuties S1 ×8, Brush of Magic Mystery S1 ×10, Windows of Attraction ×7.
- Same count as the manual comparison.
- "Tod" vs "Todd" is kept as a spelling variant, recorded with sources on both sides.

**Sets**
- 6 complete: Animated Cuties S1 and S2, Brush of Magic Mystery S1–S3, Disney Classics London.
- Windows of Attraction 2026 is 10/12; the November and December pins aren't released, and none were created.
- Brush of Magic LE has no published total.

**Audit:** 846 populated pin fields, 0 without evidence.
