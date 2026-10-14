# PinHunt independent catalogue: dashboard

_Generated from engine output `research/catalogue-engine/out/consolidated/staging_payload.json` (run 5f4e34424548, 2026-10-14). Do not edit by hand: run `tools/dashboard.py`._

## Headline

| Measure | Value |
|---|---|
| Candidate pins | **854** |
| Unique candidate pins (excl. catalogue duplicates and flagged repeats) | ≈ 801 |
| Sets / releases | 404 |
| **Directly verified pins** (a person or a physical pin; snippets never count) | **0** |
| **Publication-ready** (directly verified and approved) | **0** |
| Identity confidence High / Medium / Low / Unverified | 148 / 354 / 350 / 2 |
| 2+ independent publishers (fan databases and repeats excluded) | 510 |
| Any official source / news but no official / fan only | 219 / 221 / 414 |
| Blocking contradictions / flagged possible duplicates / catalogue duplicates | 27 / 26 / 27 |
| Pins with variant values (need a per-pin note) | 106 |

## Progress towards an independent catalogue

Two bars per milestone: research candidates, and **directly verified** pins (the number that counts).

```
 1,000  candidates █████████████████░░░ 854/1,000 (85.4%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/1,000 (0.0%)
 5,000  candidates ███░░░░░░░░░░░░░░░░░ 854/5,000 (17.1%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/5,000 (0.0%)
10,000  candidates ██░░░░░░░░░░░░░░░░░░ 854/10,000 (8.5%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/10,000 (0.0%)
```

## By line

| Line | Pins | High | Med | Low | 2+ pubs | Official | Directly verified | Conflicts | Dup flags |
|---|---|---|---|---|---|---|---|---|---|
| Disneyland Paris | 340 | 0 | 166 | 173 | 176 | 0 | 0 | 18 | 13 |
| Disney Store UK | 181 | 100 | 56 | 25 | 114 | 163 | 0 | 1 | 3 |
| Walt Disney World | 148 | 4 | 64 | 79 | 85 | 4 | 0 | 2 | 1 |
| Disneyland Resort | 108 | 10 | 50 | 48 | 65 | 15 | 0 | 2 | 6 |
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

Total: 882 searches, 854 named pins found by search (≈ 1.0 per search). Search-based gains are now small; verification, not search volume, is the constraint.

## Measured accuracy of candidates (blind audit)

Automatic per-dimension scoring (`tools/accuracy_bench/score_blind.py`) against independent blind re-research. **Random sample (16 releases, 60 pins): identity 90%, grouping 93%, edition size 94%. DSUK pilot sample (10 sets, 77 pins): identity 99%, grouping 100%, edition size 100%.** Hand-adjudicated overall result for the random sample: 83% fully correct (identity + grouping), 8% wrong or mis-structured, 8% unconfirmed. Errors concentrate in Low-confidence DLP sets (combined vs separate characters). Indicative only: small samples, snippets on both sides. After the grouping pass (132 one-pin/separate-pins claims, 9 grouping corrections proposed), the split Pajama Party records are blocked for review and a combined record exists; approvable pins in the random sample: identity 89%, grouping 92%. A fresh blind sample is the next measurement.

See `COVERAGE.md` for the release coverage map.
