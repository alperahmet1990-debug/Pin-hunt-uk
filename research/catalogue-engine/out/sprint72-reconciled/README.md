# Sprint72 reconciled payload: load this one only

Replaces the separate fast-batch (494) and OE (730) payloads (overlap 124). Built 16 Oct 2026.

- **1,100 pins, 688 sets.** No research_key appears twice. The 100-pin pilot already in staging is excluded.
- **Live catalogue check (15,978 pins, export of 16 Oct).**
  - 0 matches to public pins. The public catalogue is Collectible PinTrader, which runs 1995–2019.
  - 12,000+ archived seed rows ignored (edition "Seed", synthetic).
  - 38 candidates match an archived real record. They are held with a `possible duplicate of archived legacy record PHUK-…` reason, which blocks batch approval.
- **Ready for human verification: 1,047.**
  - 451 are approvable under today's rules (High/Medium); 468 of the 1,047 come from the fast batch.
  - 596 are Low confidence, so they need #322 before they can be approved.
- **Held: 53** (conflicts, cross-set duplicates, archived matches).
- Passes the offline 045 load test. Nothing has been approved, imported or loaded.
- Matcher: `tools/live_match.py`. The raw live export stays out of the repo.
