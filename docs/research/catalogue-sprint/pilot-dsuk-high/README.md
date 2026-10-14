# Verification pilot: 100 High-confidence Disney Store UK pins, 23 official pages

**Status:** candidates. Nothing here is verified, approved or imported.
- **Approval is not an import.** Approval only changes the candidate's status in the staging research tables.
- **Importing approved pins is a separate step** that needs your explicit go.

## Files
- **`pilot_dsuk_high_payload.json`:** the research run to load in Research Review. It holds 100 pins and their 22 sets (700 evidence rows), and passes the server's own validator (`validateResearchRun`).
- **`pilot_dsuk_high_checklist.xlsx`:** one row per Disney Store page to open, the candidate pins it names, and a "Review on its own" column.
  - 3 pins carry a possible-duplicate flag.
  - 12 have variant values (price or date) that need a note saying which value you confirmed.
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

## Not in scope
- Production.
- Importing approved pins.
- Treating an affiliate feed as verification. That needs the feed licence and its field coverage confirmed first.
