# Reviewing the backfill in Research Review

How to look at the historical research (2015–2026) in the Research Review screen, record decisions, and send "Research needed" pins back to the hourly research. Nothing here touches production Supabase or the live catalogue.

## What you need

| Piece | Where |
|---|---|
| Research Review screen with the **Catalogue** tab | branch `claude/research-review-historical` (PR to `main`, not merged) |
| Research runs, split for staging | this branch: `research/catalogue-engine/out/backfill-runs/run_*.json` (+ `index.json`) |
| Research rules and ledger | `research/catalogue-engine/BACKFILL-RULES.md`, `docs/research/catalogue-backfill/BACKFILL-LEDGER.md` |

The runs are a snapshot of the research at the time they were generated. Regenerate them from the latest research with:

```
cd research/catalogue-engine
python3 -m engine "evidence/*.json" --out /tmp/engrun
python3 tools/split_runs.py /tmp/engrun/staging_payload.json out/backfill-runs
```

Each run stays under the API's limits (2,000 records, 50,000 evidence rows, 5 MB) and never splits a set from its pins.

## 1. Preview on a Mac and an iPad (no Supabase, no accounts)

From the repository on the Mac:

```
git fetch origin claude/research-review-historical claude/pinhunt-disney-catalogue-research-c8o2x4
git checkout claude/research-review-historical
pnpm install
git show origin/claude/pinhunt-disney-catalogue-research-c8o2x4:research/catalogue-engine/out/backfill-runs/run_01_wdw.json > /tmp/run_01.json
# repeat for run_02 … run_07 (names are in index.json), then:
node artifacts/pinhunt/scripts/research-review-preview.mjs /tmp/run_0*.json
```

The script builds the web app in a preview-only admin mode (it refuses to switch that mode on if Supabase is configured), loads the runs and prints two addresses:

- Mac: `http://localhost:8787/admin/research-review`
- iPad on the same Wi-Fi: `http://<mac-ip>:8787/admin/research-review` (the exact address is printed)

Open **Catalogue**. You can:

- filter by year, line, edition (OE/LE/LR), status, set and source, or search by name;
- switch to **Flagged**, **Possible duplicates** or **Incomplete sets** (set completeness: expected vs identified members, never invented);
- tick pins and use the batch bar, or use the buttons on a row: **Validate**, **Research needed**, **Reject**, **Flag issue** (a note is required for everything except Validate);
- **Import my checks**: upload the backfill workbook with a filled-in *My check* column, then **Validate N** for the pins that pass the rules;
- **Export research needed**: download the JSON for the hourly research (step 3).

Validate follows the same rules as staging: a pin needs a direct check first, and a pin with a conflict, a hold or low confidence is refused with the reason. Preview decisions are saved on the Mac in `~/.pinhunt-research-review-preview.json`, so they survive a restart; delete that file to start again. They are not sent anywhere.

## 2. Staging (needs your approval before anything is loaded)

When you approve it, the same screen runs against staging and decisions are stored permanently in the staging research tables (`catalogue_candidates`, `catalogue_evidence`, migration 045), attributed to your account:

1. Confirm migration 045 is applied on staging (see the staging runbook).
2. Run the API server against staging and the app in staging mode from the `claude/research-review-historical` branch (or `main` once the PR is merged).
3. Sign in as an App Creator, open Research Review → **Load research run (JSON)**, and load `run_01` … `run_07` one at a time. Each load is previewed and validated before anything is written.

Loading a run writes only to the staging research tables. Importing approved pins into the catalogue is a separate step that does not exist yet and needs its own approval.

## 3. Research needed → hourly research

1. In the Catalogue tab, mark pins **Research needed** (with a note) or **Flag issue**.
2. Tap **Export research needed**. This downloads `research-needed-<date>.json` (format `pinhunt-research-needed-v1`).
3. Commit that file to `docs/research/catalogue-backfill/research-needed/` on the research branch, or send it to the research session.
4. The next hourly round turns it into follow-up research cells (one per line and year) and reopens matching long-term backlog items. Your notes are treated as leads, never as evidence, and all source restrictions still apply.

## What persists where

| Action | Preview | Staging |
|---|---|---|
| Validate / Research needed / Reject | `~/.pinhunt-research-review-preview.json` on the Mac | `catalogue_candidates.status`, `decided_by`, `decided_at`, `decision_notes` |
| Flag issue, direct check, imported spreadsheet checks | same file | `catalogue_evidence` rows (method `human_direct_check`, `checked_by` = you) |
| Spreadsheet checks you send in chat | `docs/research/catalogue-backfill/reviewer-checks/` (reviewer notes only) | same |
