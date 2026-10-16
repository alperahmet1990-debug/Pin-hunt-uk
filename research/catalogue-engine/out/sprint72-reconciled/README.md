# Sprint72 reconciled payloads (2020–2026): load these three runs, nothing else

Built 16 Oct 2026 from every evidence packet (engine: 2,113 pins, audit 0 problems). They replace all earlier sprint payloads.

| Run | Pins | Sets | Held | Ready | Approvable today (High/Medium) |
|---|---|---|---|---|---|
| `run_wdw.json` | 833 | 499 | 71 | 762 | 115 |
| `run_dlr.json` | 533 | 280 | 37 | 496 | 115 |
| `run_other.json` (DLP, Disney Store, other) | 636 | 239 | 75 | 561 | 245 |
| **Total** | **2,002** | **1,018** | **183** | **1,819** | **475** |

- **No overlap.** No research_key appears in more than one run. The 100-pin pilot already in staging is excluded.
- **Excluded:** 10 pins whose only sources don't count (lead-only).
- **Live check** (all 15,978 pins, export of 16 Oct):
  - 0 matches to public pins.
  - 74 matches to archived real records. These are held with a `possible duplicate of archived legacy record PHUK-…` reason.
  - Seed rows ignored.
- **Low confidence:** ready pins that aren't High/Medium need #322 before they can be approved.
- Each run passes the offline 045 load test and is under the 5 MB limit.
- Nothing has been approved, imported or loaded.
