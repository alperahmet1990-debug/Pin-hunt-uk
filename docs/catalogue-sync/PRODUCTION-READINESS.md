# Production readiness for catalogue work: prioritised plan

**Status:** plan only, 12 Nov 2026. Nothing has been switched, deployed or applied. Catalogue tools stay pointed at staging until every item in **Before switching** is ticked and you decide to switch.

Columns:
- **Who:** *you* = maintainer-only (dashboards, credentials, deploys); *agent* = can be prepared as a draft or PR for your review.
- **Other sessions:** whether it can happen without affecting the board-scanning and bulk-matcher work.

## P0: protect what exists (now)

| # | Item | Who | Other sessions |
|---|---|---|---|
| 1 | **Preserve staging catalogue work.** Until the catch-up is done: don't reset staging (`staging:restore`), don't delete its buckets, and don't run `copy-catalogue-to-staging.mjs --refresh-images`, which would point staging pins back at production photos. The plain re-copy is safe: it keeps staging photos (#384). Board scans, match decisions and cleaned photos all count as work to keep. | you | Unaffected |
| 2 | **Confirm database backups for both projects (#54).** In each project: Database → Backups. Note whether daily backups are listed, how many days are kept, and whether point-in-time recovery is on. Pro gave daily backups from 6 Nov; check staging is covered too. | you | Unaffected |
| 3 | **Image files have no backup.** Supabase database backups don't include Storage files. Take a one-off copy of staging's catalogue-work buckets (`pin-catalogue`, `pin-contributed-images`, and `board-scans` / `bulk-image-matcher` if they exist) and production's `pin-catalogue`, into private storage. An agent can write a **download-only** script (staging-guarded, no writes) if you want it; otherwise use the dashboard's download for small numbers. | you; agent can prepare | Unaffected (reads only) |
| 4 | **Run the gap report** (`GAP-REPORT.md`) and fix any **critical** item (a production pin showing a file stored in staging) first. | you | Unaffected |

## P1: prepare (no switch)

| # | Item | Who | Other sessions |
|---|---|---|---|
| 5 | **Admin security (#51).** Run `supabase/verify/readiness/admin_access.sql` in each project; for your eyes only, as it shows emails. Check every `is_admin` / `is_app_creator` account is expected and has MFA. Turn on 2FA for every member of the Supabase organisation, Render, Expo and GitHub, and remove anyone who doesn't need access. Board scanning and bulk matching are **App Creator** tools, so App Creator should be you only in production. | you | Unaffected |
| 6 | **Migration check.** The gap report's "Migrations detected" table shows each project side by side. For anything production lacks, apply it staging first, then production, using the existing runbooks (`supabase/verify/NNN_RUNBOOK.md`). Five migrations can't be detected by the table (056, 061, 063, 064, 074); use their verify scripts. #8 found 050–055 uneven, so check those especially. | you; agent drafts | Unaffected until applied. Applying 075/076 needs coordination (item 9). |
| 7 | **Safe PinHunt IDs in production.** Production lacks `next_pinhunt_id()` (it came with 045, which also adds staging-only research tables). Draft a small new migration with **only** the sequence and function, starting above the highest PinHunt ID already in production. Staging first. | agent drafts (L3), you apply | Unaffected. Use the next free number after 076 to avoid clashing with the two branches. |
| 8 | **Random pin ID fix.** `app/admin/pin/[id].tsx` invents a random `PHUK-` number for new pins. Change it to ask `next_pinhunt_id()` at save time, through the repository layer, and fail clearly if the function is missing. Depends on 7 in each project. | agent PR | Unaffected: neither branch touches that file |
| 9 | **Merge the two in-progress branches.** Board scanning (075) and bulk matcher (076) conflict in three small places: route registration, admin menu, memory index. Merge one, rebase the other. **Board scanning has no on/off switch**, unlike the bulk matcher's `BULK_IMAGE_MATCHER_ENABLED`. Once merged, it's live for App Creators on any API running `main`. Ask that session to add a `BOARD_SCAN_ENABLED` switch (default off) before merging. **Also ask both sessions to add `PIN_AND_POP_REFERENCES_ENABLED`, default off**, so neither tool sends Pin & Pop images to the AI service until the agreement question is answered (`PIN-AND-POP-QUESTIONS.md`). Until then, keep staging free of Pin & Pop reference rows while testing: the gap report's exposure check shows the count. | coordinate with those sessions | **Needs coordination**: don't merge while their staging test runs are pending, and don't change the staging API's settings under them |
| 10 | **Production API, prepared but unused.** A second Render service from `main`. Settings from `artifacts/api-server/.env.example`, with the production Supabase URL, anon and service-role keys. Separate or capped OpenAI and Pixian keys. `PIXIAN_TEST_MODE` decided deliberately. `BULK_IMAGE_MATCHER_ENABLED` off (and `BOARD_SCAN_ENABLED` off once it exists). Daily caps (`CONTRIBUTOR_DAILY_*`, `BOARD_*`, `BULK_*`). Check `/api/healthz`. **Don't** point the EAS `production` environment, the contributor website, or any admin tool at it yet. Fix `API-DEPLOY.md`, which calls the staging service production. | you (Render); agent fixes the doc | Unaffected: a new service, staging's untouched |

## Before switching: all must be true

Pointing catalogue tools at production is a separate decision. Tick these first:

- [ ] Gap report run, critical items fixed, and the catch-up approach chosen (manual or small script). Staging work to keep is listed.
- [ ] Copies of staging's catalogue-work files exist outside Supabase (item 3).
- [ ] Database backups confirmed for both projects, and **one restore rehearsed into a new, empty project**. Never restore over staging or production.
- [ ] Production has every migration the API and tools need: 045's ID function (item 7), the 073 marker, 075/076 after merging, and anything else the migration table shows missing. Verify scripts pass.
- [ ] Production API healthy; signing in works against **production**; uploads land in **production** storage. Staging API unchanged.
- [ ] Admin accounts reviewed with MFA on; App Creator limited to you.
- [ ] Rights: production's `catalogue_sources` rows for `pinhunt_board_scan`, `pinhunt_bulk_upload` and the contributed-photo source say what you intend. Collectible PinTrader edits still need #23. Pin & Pop unchanged until the questions in `PIN-AND-POP-QUESTIONS.md` are answered.
- [ ] One small end-to-end test with the merged code on **staging** (one board, a few bulk photos), then the same tiny test on production before real batches.
- [ ] Caps and budgets set; Pixian live mode on only deliberately.

## After switching

- Real catalogue work (approvals, board scans, bulk photos) happens in production. Staging keeps the same tools for testing only.
- Refresh staging's catalogue from production with `copy-catalogue-to-staging.mjs`. Add `--refresh-images` only after the catch-up has brought staging's photos across.
- TestFlight stays on staging. The `production` app channel waits for launch.
