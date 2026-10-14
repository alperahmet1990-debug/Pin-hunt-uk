# PinHunt independent catalogue: dashboard

_Generated from engine output `research/catalogue-engine/out/consolidated/staging_payload.json` (run 747b2fa96917, 2026-10-14). Do not edit by hand: run `tools/dashboard.py`._

## Headline

| Measure | Value |
|---|---|
| Candidate pins | **871** |
| Unique candidate pins (excl. catalogue duplicates and flagged repeats) | ≈ 816 |
| Sets / releases | 404 |
| **Directly verified pins** (a person or a physical pin; snippets never count) | **0** |
| **Publication-ready** (directly verified and approved) | **0** |
| Identity confidence High / Medium / Low / Unverified | 148 / 363 / 358 / 2 |
| 2+ independent publishers (fan databases and repeats excluded) | 517 |
| Any official source / news but no official / fan only | 221 / 230 / 420 |
| Blocking contradictions / flagged possible duplicates / catalogue duplicates | 22 / 27 / 28 |
| Pins with variant values (need a per-pin note) | 107 |

## Progress towards an independent catalogue

Two bars per milestone: research candidates, and **directly verified** pins (the number that counts).

```
 1,000  candidates █████████████████░░░ 871/1,000 (87.1%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/1,000 (0.0%)
 5,000  candidates ███░░░░░░░░░░░░░░░░░ 871/5,000 (17.4%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/5,000 (0.0%)
10,000  candidates ██░░░░░░░░░░░░░░░░░░ 871/10,000 (8.7%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/10,000 (0.0%)
```

## By line

| Line | Pins | High | Med | Low | 2+ pubs | Official | Directly verified | Conflicts | Dup flags |
|---|---|---|---|---|---|---|---|---|---|
| Disneyland Paris | 340 | 0 | 167 | 172 | 177 | 0 | 0 | 13 | 12 |
| Disney Store UK | 181 | 100 | 56 | 25 | 114 | 163 | 0 | 1 | 3 |
| Walt Disney World | 165 | 4 | 72 | 88 | 91 | 4 | 0 | 1 | 3 |
| Disneyland Resort | 108 | 10 | 50 | 48 | 65 | 17 | 0 | 3 | 6 |
| Earlier POC + pilot | 77 | 34 | 18 | 25 | 70 | 37 | 0 | 4 | 3 |

## Verification effort (from the worklist)

- Pages to open to cover named pins: **343** (73 official, covering 203 pins).
- At about 2 min per page with set-level review: **≈ 11.4 h** for everything; the DSUK High pilot (101 pins, 24 pages) ≈ 48 min.
- Per-pin review without set-level checks: about 1–2 min per pin.

## Research throughput

| Pass | Date | Searches | New named pins | Pins gaining an independent 2nd source |
|---|---|---|---|---|
| POC + pilot (earlier, 2026 sets) | 2026-10-13 | 0 | 77 | 0 |
| Wave 1 (DLP + DSUK 2024-26) | 2026-10-14 | 185 | 295 | 0 |
| Wave 1 gap-fill + Wave 2 (WDW/DLR LE) | 2026-10-14 | 185 | 469 | 23 |
| Pass 3 corroboration | 2026-10-14 | 188 | 1 | 276 |
| Pass 4 targeted gap-fill (source rules) | 2026-10-14 | 151 | 0 | 77 |
| Blind accuracy audit | 2026-10-14 | 36 | 0 | 0 |
| Blind re-check of DSUK pilot sample | 2026-10-14 | 15 | 5 | 20 |
| Pass 5 grouping + variants (DLP, WDW, DLR) | 2026-10-14 | 122 | 7 | 0 |
| Fresh blind accuracy test (20 new releases) | 2026-10-14 | 28 | 0 | 0 |
| Pass 6 disagreements + grouping gaps | 2026-10-14 | 28 | 0 | 12 |
| Pass 7 WDW festival coverage | 2026-10-14 | 19 | 17 | 27 |

Total: 957 searches, 871 named pins found by search (≈ 0.9 per search). Search-based gains are now small; verification, not search volume, is the constraint.

## Measured accuracy of candidates (blind audit)

**Fresh blind test (20 releases not used before, 84 pins), after the grouping pass:** automatic scoring identity 94%, grouping 97%, edition size 87%, release date 90%; hand-adjudicated identity ≈99% (1 unconfirmed), grouping ≈99% (1 disagreement, now blocked), edition size: 1 set (4 pins) disagrees (now blocked), dates: park-vs-store timing only. Earlier random sample (before the grouping pass): 83% fully correct. DSUK pilot sample: 99–100%. Disagreements are recorded and block approval until a person decides. Indicative: snippets on both sides.

See `COVERAGE.md` for the release coverage map.
