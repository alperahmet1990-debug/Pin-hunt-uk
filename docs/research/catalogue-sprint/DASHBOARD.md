# PinHunt independent catalogue: dashboard

_Generated from engine output `research/catalogue-engine/out/consolidated/staging_payload.json` (run fb6acebe6a68, 2026-10-14). Do not edit by hand: run `tools/dashboard.py`._

## Headline

| Measure | Value |
|---|---|
| Candidate pins | **842** |
| Unique candidate pins (excl. catalogue duplicates and flagged repeats) | ≈ 782 |
| Sets / releases | 404 |
| **Directly verified pins** (a person or a physical pin; snippets never count) | **0** |
| **Publication-ready** (directly verified and approved) | **0** |
| Identity confidence High / Medium / Low / Unverified | 149 / 347 / 344 / 2 |
| 2+ independent publishers (fan databases and repeats excluded) | 511 |
| Any official source / news but no official / fan only | 213 / 220 / 409 |
| Blocking contradictions / flagged possible duplicates / catalogue duplicates | 17 / 33 / 27 |
| Pins with variant values (need a per-pin note) | 97 |

## Progress towards an independent catalogue

Two bars per milestone: research candidates, and **directly verified** pins (the number that counts).

```
 1,000  candidates █████████████████░░░ 842/1,000 (84.2%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/1,000 (0.0%)
 5,000  candidates ███░░░░░░░░░░░░░░░░░ 842/5,000 (16.8%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/5,000 (0.0%)
10,000  candidates ██░░░░░░░░░░░░░░░░░░ 842/10,000 (8.4%)
        verified   ░░░░░░░░░░░░░░░░░░░░ 0/10,000 (0.0%)
```

## By line

| Line | Pins | High | Med | Low | 2+ pubs | Official | Directly verified | Conflicts | Dup flags |
|---|---|---|---|---|---|---|---|---|---|
| Disneyland Paris | 333 | 0 | 166 | 166 | 176 | 0 | 0 | 10 | 13 |
| Disney Store UK | 176 | 101 | 49 | 26 | 115 | 157 | 0 | 1 | 4 |
| Walt Disney World | 148 | 4 | 64 | 79 | 85 | 4 | 0 | 0 | 7 |
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

Total: 745 searches, 842 named pins found by search (≈ 1.1 per search). Search-based gains are now small; verification, not search volume, is the constraint.

## Measured accuracy of candidates (blind audit)

Blind re-research of 16 random releases (60 of our pins resolved): **83% confirmed, 8% wrong or mis-structured, 8% unconfirmed**. Errors are mostly combined-vs-separate character pins in Low-confidence DLP sets. See `accuracy-audit-2026-10-14.md`. Indicative only (small sample, snippets on both sides).

See `COVERAGE.md` for the release coverage map.
