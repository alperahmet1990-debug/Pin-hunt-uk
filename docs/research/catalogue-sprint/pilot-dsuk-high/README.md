# Verification pilot: 100 High-confidence Disney Store UK pins, 23 official pages

**Status:** candidates. Nothing here is verified, approved or imported.
- **Approval is not an import.** Approval only changes the candidate's status in the staging research tables.
- **Importing approved pins is a separate step** that needs your explicit go.

## Files
- **`pilot_dsuk_high_payload.json`:** the research run to load in Research Review. It holds 100 pins and their 22 sets (700 evidence rows), and passes the server's own validator (`validateResearchRun`).
- **`pilot_dsuk_high_checklist.xlsx`:** one row per Disney Store page to open, the candidate pins it names, and a "Review on its own" column.
  - 4 pins carry a possible-duplicate flag (see *Decisions for you* below).
  - 19 have variant values (price or date) that need a note saying which value you confirmed.
  - 11 are multi-character pins: confirm on the page that it is one pin showing those characters.
  - None has a blocking conflict.

## Staging steps (laptop, about 45 minutes the first time)
Use the existing staging tooling and `supabase/verify/045_RUNBOOK.md`.

1. **Env files.**
   - Copy `artifacts/api-server/.env.staging.example` → `.env.staging` and `artifacts/pinhunt/.env.staging.example` → `.env.staging`.
   - Fill them from the **staging** project (Dashboard → Project Settings → API).
   - The service-role key goes only in the API server file.
2. **Migration 045 on staging** (runbook steps 1–4).
   - Confirm the staging project ref.
   - Paste `supabase/migrations/045_catalogue_research_staging.sql` → Run.
   - Run `notify pgrst, 'reload schema';`
   - Paste `supabase/verify/045_verify.sql` → expect `ALL 045 CHECKS PASSED`.
3. **Start the API on staging:**
   `pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/api-server run start:staging`
4. **Start the app on staging:**
   `pnpm --filter @workspace/pinhunt run dev:staging`
   Open it in the simulator or a browser, then sign in with your **App Creator** account on staging.
5. **Smoke test** (runbook step 5):
   - Admin → Research Review shows "No runs".
   - The pin editor still saves a title edit.
   - A dry-run catalogue import that reuses an existing id with a different pin is refused.
6. **Load the pilot.** Research Review → *Load research run (JSON)* → choose `pilot_dsuk_high_payload.json` → check the preview (100 pins, 22 sets) → *Load run*.
7. **Review page by page.** Follow the checklist's 23 rows, in order. For each row:
   1. Open the page in your own browser.
   2. Use *Review set* for that set, paste the page link and tick **only** the pins the page shows. Tick the fields you confirmed (characters / pin name, plus edition size, price or date if shown). Then *Record set check*.
   3. *Approve ticked pins*. Pins with variant warnings or a possible-duplicate flag are best approved one by one, with a note.
   4. Use *Needs more research* or *Reject* on any pin the page doesn't support.
8. **Report back:** pins approved, rejected, needs-more-research, and anything odd (wrong page, discontinued listing, price changed).

**Expected time:** about 2 minutes per page, so 23 pages take about 45–50 minutes.

## Decisions for you (the 5 pins the import would refuse today)
The offline import test imports 95 of the 100 pins. These 5 need a person:

| Pin | Why it is held | What decides it |
|---|---|---|
| Valentine's Day 2026 Mystery Set: **Stitch** | Same character as a pin in Brush of Magic Mystery Series 1 | Different products (UK item 438010543840 vs 438030648549), theme and date. Probably distinct designs: compare the two listings' images. |
| Valentine's Day 2026 Mystery Set: **Winnie the Pooh** | Same, vs Brush of Magic Series 1 | As above. |
| Valentine's Day 2026 Mystery Set: **Powerline** | Same, vs Brush of Magic Series 3 (item 438011184943) | As above. |
| Stitch 626 Day 2025 Mystery Set: **Experiment 626 (Stitch)** | Same character as a pin in the Pin Trading 25 Years Mystery Set | Two different UK products (438019579918 vs 438019581485) released the same day, 22 May 2025. Probably distinct designs: compare the two listings' images. |
| Magical Medallions (Jan 2024): **Big Hero 6** | No named character in any evidence | Read the character(s) off the listing image during the direct check. |

The engine flags any pin whose character appears in a related set (shared set word or same release date). It never merges them.

**Approving a flagged pin is not enough to import it:** the import refuses any candidate whose review reasons mention a duplicate, and approval does not change those reasons. To clear one:
1. Compare the two listings and tell me "X and Y are different pins" (or that they are the same).
2. I record your finding (`distinct: not the same pin as …`) in the evidence. It clears the flag for that pair only and stays in the evidence trail.
3. I regenerate the pilot, and you reload it in Research Review before approving.
The same goes for Big Hero 6: send me the character you read off the listing and I add it, attributed to you.

Do this **before** the staging session if you can (it works from your phone): a regenerated pilot is a new research run, so approvals made on the old run would not carry over.

## Not in scope
- Production.
- Importing approved pins, until you choose to. The import (#241) is merged: dry run first, then import, on staging only (`LAPTOP-CHECKLIST.md` §6).
- Treating an affiliate feed as verification. That needs the feed licence and its field coverage confirmed first.
