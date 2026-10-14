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

---

## Update: Pass 3, second-source corroboration (same day)
- **What ran:** five supervised helpers searched for a second, independent publisher for every pin that had only one, using about 190 searches. Packets: `evidence/61–65_corrob_*.json`.
- **Status:** still candidates. All claims remain search summaries, and direct verification is still **0 of 842**.

**Engine fix in this pass**
- Regional Disney Store sites (disneystore.co.uk / .eu / .com / .asia / shopdisney.*) now count as **one publisher**, and twitter.com and x.com as one. Before this, a UK listing and an EU listing of the same product counted as two independent sources. That overstated the earlier figures.
- 28 tests pass. Audit: 6,405 populated pin fields, 0 problems.

**Results** (re-run over all packets; 842 pins, one new Disneyland pin)

| Line | Pins | High | Medium | Low | 2+ publishers before → after | Any official | News (no official) | Fan only |
|---|---|---|---|---|---|---|---|---|
| DLP | 333 | 0 | 132 | 200 | 56 → **142** | 0 | 31 | 302 |
| DSUK | 176 | 104 | 53 | 19 | 68 → **139** | 145 | 10 | 21 |
| WDW | 148 | 2 | 47 | 98 | 22 → **67** | 2 | 107 | 39 |
| DLR | 108 | 11 | 53 | 44 | 14 → **69** | 15 | 44 | 49 |
| Earlier | 77 | 34 | 18 | 25 | 70 → 70 | 37 | 29 | 11 |
| **Total** | **842** | **151** | **303** | **386** | 230 → **487** | 199 | 221 | 422 |

- Two pins remain without an evidence-backed identity (Unverified).
- **Engine-corroborated:** 260 → **444**. Still not verification.
- **Pins with blocking identity conflicts:** 5 → **10**. Examples: Lilo vs Stitch with Angel, Goofy vs Goofy & Rafiki, Chip and Dale as one pin vs two, Mother Gothel vs Rapunzel & Mother Gothel.
- **Prices and dates:** these disagreements are warnings, not blocks.
- **Possible duplicates flagged:** 33. Exact duplicates of the trusted catalogue: 27.

**Decision needed: disneypinventory.com.** It is a fan pin *database*, comparable in kind to PinPics.
- It is not on the excluded list, but it may conflict with the aim of a catalogue that does not rely on other pin databases.
- It is cited by 72 pins. For **60** of them it supplies the only second publisher.
- If excluded, those 60 drop back to one publisher. Nothing else is affected.
- It is currently classed as unclassified, which counts like fan.

**Remaining verification gaps**
- **Direct check:** 842 pins.
- **Single-publisher:** 355 pins (DLP 191, WDW 81, DLR 39, DSUK 37, earlier 7).
- **No official source:** DLP (0 of 333) and WDW (2 of 148).

---

## Update: Pass 4, maintainer source rules and targeted gap-fill
**Rules applied** (maintainer decision, 2026-10-14):
- Disney Pinventory is a **fan database**. It is used for discovery and secondary corroboration only, never as an independent publisher, and no identifiers are taken from it.
- Mousesteps and similar sites are **fan** sources.
- A claim that repeats another outlet's release information counts under that outlet (`derived_from`).
- Secondary-only evidence is capped at **Medium**.

**Effect of the rules:** 46 pins that leaned on Disney Pinventory fell back to a single publisher, giving 401 single-publisher targets.

**Pass 4:** about 151 searches, at most 2 per release. **77 pins** gained an independent second publisher: 14 official, 19 news, 44 fan.
- **Yield was low** for DLP 2024 (14 of about 100). Most of those releases are only described by one fan site, so search-based corroboration is close to exhausted there.

**Now** (842 pins, all still candidates; 0 directly verified):

| Line | Pins | High | Medium | Low | 2+ independent publishers | Any official |
|---|---|---|---|---|---|---|
| DLP | 333 | 0 | 166 | 166 | 176 | 0 |
| DSUK | 176 | 101 | 49 | 26 | 115 | 157 |
| WDW | 148 | 4 | 64 | 79 | 85 | 4 |
| DLR | 108 | 10 | 50 | 48 | 65 | 15 |
| Earlier | 77 | 34 | 18 | 25 | 70 | 37 |
| **Total** | **842** | **149** | **347** | **344** | **511** | **213** |

- **Unverified:** 2 pins.
- **Blocking identity conflicts:** 17. Flagged possible duplicates: 33. Exact duplicates of the trusted catalogue: 27.
- **Verification worklist:** `out/consolidated/verification_worklist.xlsx`. 343 pages cover 739 pins. 24 official Disney Store pages cover the 101 DSUK High pins.
