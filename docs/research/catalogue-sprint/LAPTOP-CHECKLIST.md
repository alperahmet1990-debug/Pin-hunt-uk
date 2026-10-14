# Laptop session checklist: staging, verification, smoke test, safe imports

Work top to bottom.
- **Only staging is touched.** Production is not part of this checklist.
- **Nothing here imports pins.** Approving a candidate only changes its status in the research tables.

## 0. Already done offline (no action needed)
- **Migration 045 replays cleanly** on a local throwaway Postgres (PGlite) after migrations 002–044.
  - 53/54 files apply. The one failure is `006_trade_ratings`, a pre-existing duplicate policy unrelated to 045.
  - `045_verify.sql` passes.
- **The pilot run loads** exactly as the API loads it. Tool: `research/catalogue-engine/tools/offline_load_test.mjs`.
  - 101 pins, 23 sets, 668 evidence rows.
- **The full run also loads:** 842 pins, 404 sets, 8,510 evidence rows.
- **Guards hold:**
  - approval without a direct check is refused
  - an unattributed human check is refused
  - an excluded-source URL is refused
  - a set check followed by per-pin approval works (16 pins)
  - the `pins` table is untouched
- **Payloads pass the server's own validator** (`validateResearchRun`).

## 1. Staging setup (about 15 min)
1. **Pull `main`.** It contains #229 (identity guard, 045, Research Review) and #234 (set-level review).
2. **Run** `pnpm install --frozen-lockfile`.
3. **API server env:** copy `artifacts/api-server/.env.staging.example` → `artifacts/api-server/.env.staging`. Fill `STAGING_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` and the staging service-role key.
4. **App env:** copy `artifacts/pinhunt/.env.staging.example` → `artifacts/pinhunt/.env.staging`. Fill `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from **staging**. Leave `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api`.
5. **Optional sanity check:** `pnpm --filter @workspace/api-server run staging:check`.

## 2. Migration 045 on staging (about 10 min; `supabase/verify/045_RUNBOOK.md`)
1. **Confirm the project.** In the Supabase dashboard, open the staging project and check its ref = `STAGING_PROJECT_REF`.
2. **Note the max id.** SQL Editor: `select max(pinhunt_id) from pins;`
3. **Apply.** Paste all of `supabase/migrations/045_catalogue_research_staging.sql` → Run. Then run `notify pgrst, 'reload schema';`
4. **Verify.** Paste `supabase/verify/045_verify.sql` → Run. Expect `ALL 045 CHECKS PASSED`.
   - **If it fails:** stop, copy the output, and run the rollback block at the end of the migration.

## 3. Start staging (about 5 min)
- **API:** `pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/api-server run start:staging`
- **App:** `pnpm --filter @workspace/pinhunt run dev:staging`. Open it in the browser or simulator, then sign in with your **App Creator** account on staging.

## 4. Smoke test (about 10 min)
- [ ] Admin → Research Review opens and shows "No runs".
- [ ] Admin pin editor: change a pin title and save. It saves.
- [ ] Admin catalogue import, **dry run**, with a sheet that reuses an existing `pinhunt_id` for a different pin. The row is refused with the identity message.
- [ ] Admin catalogue import, dry run, with a sheet that only corrects a typo in an existing pin. It is accepted.

## 5. Verification pilot (about 50 min; `pilot-dsuk-high/README.md`)
1. **Load the run.** Research Review → *Load research run (JSON)* → `docs/research/catalogue-sprint/pilot-dsuk-high/pilot_dsuk_high_payload.json`. The preview should show 101 pins and 23 sets. Then *Load run*.
2. **Work through the checklist** (`pilot_dsuk_high_checklist.xlsx`, 24 rows). For each row:
   1. Open the Disney Store page in **your own browser**.
   2. Research Review → **Review set** → paste the page link and tick **only** the pins the page shows. Tick the fields you confirmed → **Record set check**.
   3. For multi-character pins, confirm whether the page shows **one pin with both characters or separate pins**. The blind audit found this to be the most common mistake.
   4. **Approve ticked pins** for clean pins. Approve the 15 marked "Review on its own" one at a time, with a note. These are 12 with variant values and 3 possible duplicates.
   5. Use **Needs more research** or **Reject** for anything the page doesn't support.
3. **Note the results:** approved, rejected, needs-more-research, and minutes taken. Tell Claude "status".

## 6. Safe imports: NOT YET
- **There is no import route for research candidates yet.** This is by design (#229).
- **Do not use** the catalogue spreadsheet importer or `import-trusted-catalogue.mjs` to bring research candidates in.
- **Next step:** a reviewed design for importing approved candidates as **new** pins only. Existing pins are enriched through audited changes; the `candidate_import_creates_new_pin` constraint already enforces this. It will come as its own issue and PR, dry run first, staging first.

## 7. Production
Not approved. A separate decision is needed after the staging pilot.
