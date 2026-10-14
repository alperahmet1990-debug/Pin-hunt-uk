# Basil (Catalogue Research): consolidated report, Wave 1 + gap-fill + Wave 2

- **Run type:** manual, supervised (helpers in one session). Nothing scheduled.
- **Branch:** `claude/catalogue-research-sprint1`. No PR.
- **Outputs:** engine output `research/catalogue-engine/out/consolidated/`, built from every packet in `evidence/` (the earlier POC and pilot packets plus packets 41–53).
- **Not done:** nothing was imported, staged or loaded into any database.

## Direct verification: 0 of 841 pins
- Every new claim is a search-engine summary (`search_snippet`). Page reads are still blocked by the network policy.
- No claim is a page read, a physical pin or a human direct check.
- "Engine-corroborated" (260 pins) means consistent snippets from two or more publishers, or one official listing snippet. **It is not verification.**

## Unique pins
| | Count |
|---|---|
| Candidate pin records | **841** |
| Exact duplicates of the trusted catalogue (182 rows; ids kept, not re-created) | 27 |
| Possible repeats inside the research (same set or same line, related set name), flagged for review | 32 |
| **Unique new candidate pins** (841 − 27, before resolving the 32 flags) | **≈ 790–814** |

**By line**
| Line | Pins | High | Medium | Low | 2+ publishers | Any official snippet | News only | Fan or unclassified only | Product code |
|---|---|---|---|---|---|---|---|---|---|
| Disneyland Paris 2024–26 | 333 | 0 | 49 | 283 | 56 | **0** | 25 | 308 | 0 |
| Disney Store UK 2024–26 | 176 | 33 | 111 | 32 | 68 | 142 | 10 | 24 | 42 |
| Walt Disney World LE 2023–26 | 148 | 0 | 6 | 141 | 22 | 0 | 83 | 65 | 0 |
| Disneyland Resort LE 2023–26 | 107 | 1 | 13 | 93 | 14 | 10 | 25 | 72 | 2 |
| Earlier POC + pilot (2026 sets) | 77 | 34 | 18 | 25 | 70 | 37 | 29 | 11 | 9 |
| **Total** | **841** | **68** | **197** | **574** | **230** | **189** | **172** | **480** | **53** |

Two pins have no evidence-backed identity yet (Unverified). Blocking conflicts: 5 pins. Variants: see the Review Queue sheet.

**Source classes stay separate**
- **Official:** Disney Store, Disney Parks, DLP, shopDisney.
- **News:** WDWNT, Laughing Place, Inside the Magic, …
- **Fan or unclassified:** Disney Pins Blog, Mousesteps, My Pin Central, PixieDust DLP, Disney Pinventory, X/Twitter, …

The engine never upgrades a fan source.

## Set completeness
| Line | Sets | With a stated pin count | Complete | Partial | 0 named | No count, pins named | No count, no pins |
|---|---|---|---|---|---|---|---|
| DLP | 232 | 46 | 35 | 5 | 6 | 123 | 63 |
| DSUK | 46 | 39 | 29 | 8 | 2 | 1 | 6 |
| WDW | 83 | 44 | 29 | 1 | 14 | 30 | 9 |
| DLR | 34 | 23 | 18 | 3 | 2 | 5 | 6 |
| Earlier | 9 | 7 | 6 | 1 | 0 | 1 | 1 |
| **Total** | **404** | **159** | **117** | **18** | **24** | **160** | **85** |

- "Complete" means every pin of the stated count is named. That is still research completeness, not verification.
- Many DLP rows are single-pin monthly releases with no stated count.
- The DSUK "Magic of Disney" parent and drops both carry counts (29 = 11 + 9 + 9), so its gap is listed twice.

## Gap-fill and Wave 2 yield (this run)
- **Gap-fill** (Wave 1 sets only): **+214 named pins**.
  - DLP 2024–25: +86. DLP 2026: +48. DSUK: +80.
  - Plus second sources on about 23 existing pins.
- **Sets completed** include:
  - Halloween 2025 LE/OE, Cinderella 75th, Picsou
  - Alice OE July 2026, Bags, Gameboy
  - DSUK Halloween countdown 13/13, 25 Years mystery, 626 Day 2026, 25th Anniversary series 3–4
- **Wave 2:** +255 named pins (WDW 2023–24: 61, WDW 2025–26: 87, DLR 2023–26: 107).
- **Yield:** about 2.5 named pins per search, against 1.6 in Wave 1. Round-up-first queries helped.

## Engine change in this run
- **New check:** possible cross-set duplicates.
- **Rule:** same subject, same year, same line, and a related set name or identical date. These are flagged for review and never merged.
- **Found:** 21 flags, for example "Tangled Spin" June 2026 recorded under two set keys, and the WDW Railroad LE vs the earlier Windows of Attraction record.
- **Tests:** 3 new (25 total), all passing. The audit is clean: 6,191 populated pin fields, 0 problems.

## Verification gaps (what blocks "accurate")
1. **All 841 pins need a direct check.** Research Review is in `main` but waiting on staging (migration 045, laptop).
2. **DLP has no official source** (0 of 333 pins). It needs a person to check DLP posters or the DLP app, or a permitted official source.
3. **WDW has no official source** (0 of 148). The best path is the Disney Parks Blog feed or press room after a terms check.
4. **Single-publisher pins: 611 of 841.** A second independent publisher is the cheapest confidence gain.
5. **Snippet attribution risk.** Some claims were tied to a URL from the summary's wording (e.g. weekly round-ups matched by month). A few multi-character designs may have been split per character (DLP Picsou, Pajama Party, skiing). These need human checks before approval.
6. **Unnamed pins in counted sets:** about 200, led by WDW mystery and event sub-sets, DLP Pin Trading Night 2026 (8 of 12 still unnamed), DSUK Magic of Disney drops and the Mickey's Christmas Carol advent calendar.
