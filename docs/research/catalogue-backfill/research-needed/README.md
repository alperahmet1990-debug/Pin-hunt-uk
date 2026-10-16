# Research-needed inbox

Reviewer decisions from **Research Review → Catalogue** that say a pin needs more research come back to the hourly backfill through this folder.

1. In Research Review, open the **Catalogue** tab and tap **Export research needed**. This downloads `research-needed-<date>.json` (format `pinhunt-research-needed-v1`). It lists pins marked *Research needed* or *Flag issue*, with the reviewer's notes.
2. Commit that file into this folder on the research branch, or hand it to the research session.
3. On its next round, the hourly routine turns each new file into follow-up todo cells in `BACKFILL-LEDGER.md`, one cell per line and year. It then moves the file to `processed/`.

Reviewer notes are leads for the research agents, not evidence. All the usual source restrictions in `research/catalogue-engine/BACKFILL-RULES.md` still apply. The export holds no credentials and no personal data beyond the notes.
