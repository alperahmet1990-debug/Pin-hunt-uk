# Basil (Catalogue Research): Wave 1, Disneyland Paris and Disney Store UK, 2024–2026

- **Run type:** manual, supervised. Five research helpers ran in one session. Nothing is scheduled.
- **Branch:** `claude/catalogue-research-sprint1`. No PR.
- **Outputs:** packets `research/catalogue-engine/evidence/41–45_*.json`, engine output `research/catalogue-engine/out/wave1/`.
- **Not done:** nothing was imported, staged or loaded into any database.

## Status of every record: CANDIDATE
- **0 pins are directly verified.** Page reads are blocked by the network policy, so all 2,537 accepted claims are `search_snippet`.
- "Engine verified" (110 pins) only means two or more consistent snippets, or one official listing snippet. It is **not** a direct check.
- Every record still needs a person to open the source in Research Review before approval.

## Numbers (copied from the engine output)
**Totals**
- Sets (including sub-sets and single-pin releases): **271**
- Named candidate pins: **295**
- Claims accepted: 2,537. Rejected: 0.
- No-invention audit: 2,020 populated pin fields, **0 problems**.

**By slice**
| Slice | Sets | Pins |
|---|---|---|
| DLP 2024 | 57 | 40 |
| DLP 2025 | 90 | 81 |
| DLP 2026 | 78 | 78 |
| DSUK 2024 | 18 | 31 |
| DSUK 2025 | 21 | 53 |
| DSUK 2026 | 7 | 12 |

**Pin identity confidence**
- High 11, Medium 100, Low 183, Unverified 1.

**Set confidence**
- High 1, Medium 35, Low 235.

**Corroboration**
- Two or more independent publishers: 126 sets and 71 pins.
- Official source cited (Disney Store UK/EU/AU/US snippets): 36 sets and 80 pins.
- 96 pins belong to a set with an official source. These are the first beneficiaries of set-level verification.

**Data completeness**
- Release date: 246 of 271 sets.
- Expected pin count: 79 sets.
- Edition size: 70 sets.
- Product code (12-digit Disney Store item number): 34 pins.

**Review flags**
| Flag | Count |
|---|---|
| Duplicates of the trusted catalogue (182 rows, no DLP 2024–26 overlap) | 0 |
| Possible internal duplicates (same set and character) | 3 |
| Pins with a blocking conflict (edition size, Meet the Robinsons medallion) | 1 |
| Pins with variant warnings (dates, prices, names) | 14 |
| Pins in sets found incomplete | 33 |

- The duplicate check runs against the trusted catalogue only. The 13,000-row seed catalogue is speculative and archived, so it is not used for matching.

## Evidence quality
- **Publisher mix (claims)**

  | Class | Claims | Main publishers |
  |---|---|---|
  | Unclassified | 1,486 | Mousesteps, My Pin Central, PixieDust DLP, Disney Pinventory |
  | Official | 577 | Disney Store UK snippets |
  | Fan | 375 | Disney Pins Blog, X posts |
  | News | 99 | Laughing Place, WDWNT |

- **No official Disneyland Paris source surfaced in search.** DLP records rest on fan and news sites, mostly Mousesteps (938 claims). Mousesteps posts are pre-release schedules, so their dates and edition sizes are plans, not confirmations.
- No Pin & Pop, PinPics or PinTradingDB data, and no marketplace evidence. Edition sizes only seen on marketplaces were left out. No images were used and no descriptions copied.
- **Search budget:** every helper was cut off by the shared limit of 200 web searches per turn, after 26–44 searches each.

## Verification gaps
1. **Direct verification:** 0 of 295 pins. This needs Research Review on staging (laptop), or permitted page access (see `docs/research/catalogue-sprint/source-access.md`).
2. **DLP has no official source.** A person must check the DLP app, park pin posters or the DLP news site.
3. **Thin months:**
   - DLP 2024: January, May, October and December.
   - DLP 2026: August to October.
   - DSUK: Christmas 2025 sets.
4. **Sets without named pins:**
   - DLP Pin Trading Night 2026 (12 pins)
   - DLP event LE 400 sets (Aladdin, Lion King)
   - Several Pin Trading Time sets
   - DSUK puzzle-pin mystery sets
   - Advent calendar 2024 (24 pins, only 1 named)
5. **Conflicts kept as both claims:** dates (e.g. Adventure World launch pin 29 Mar vs 11 Apr), edition sizes (LE 700 vs 1,500; 800 vs 1,000), series names (Tarot vs Collector's Card). A person decides.
6. One pin name looks garbled and must be checked: the February 2025 "Snow White and Prince Charming" Cinderella 75th entry.

## Next (proposed, needs no new approval beyond the sprint)
- **Gap-fill pass with a fresh search budget:** the DLP thin months and second sources for single-source sets.
- **Wave 2:** WDW and Disneyland LE 2023–2026.
- **Source register:** classify Mousesteps, My Pin Central, PixieDust DLP and Disney Pinventory as fan or news. This is a human decision; they are currently "unclassified", with the same weight as fan.
