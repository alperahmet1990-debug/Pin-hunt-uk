# Migration 045: staging runbook (production is NOT part of this approval)

**What 045 does:** adds the research staging tables, a `pinhunt_id` sequence and a `pins_identity_guard` trigger. It is additive, and the rollback is at the bottom of the migration file.

## Pre-validated locally

`local-replay.mjs` replays `002`–`044` and then `045` on an in-process PGlite (Postgres 17), with Supabase stubs:
- **Chain:** 53/54 files apply. `006_trade_ratings.sql` fails on replay with a pre-existing duplicate policy, which has nothing to do with 045.
- **Checks:** `045_verify.sql` prints **ALL 045 CHECKS PASSED**.
- **Trigger on real data:** the 182 real id pairs from the July import give 86/86 repurposings refused and 96/96 legitimate refinements allowed.

## Staging (maintainer)

1. **Confirm the target is staging.** In the Supabase dashboard, open the staging project and check that its ref matches `STAGING_PROJECT_REF`.
2. **Check the current max id** in the SQL Editor:
   ```sql
   select max(pinhunt_id) from pins;
   ```
   Staging may hold only seed data; note the value.
3. **Apply.** Paste the whole of `supabase/migrations/045_catalogue_research_staging.sql` and Run. Then run:
   ```sql
   notify pgrst, 'reload schema';
   ```
4. **Verify.** Paste `supabase/verify/045_verify.sql` and Run. Expect one row, `ALL 045 CHECKS PASSED`. The script rolls itself back; only the id sequence advances by 1.
5. **Smoke test.** Using the staging app build (App Creator account):
   - Admin → Research review loads and shows "No runs".
   - A dry-run catalogue import of a workbook that reuses an existing id with a different pin shows the refusal message.
   - Editing a pin title in the admin pin editor still saves.
6. **Record the result** on the PR (pass/fail + the output of step 4).

## Rollback (staging)

Run the commented `Rollback` block at the end of the migration, in order. Nothing else depends on the new objects until the Research Review routes are deployed.

## Production

**Not approved yet.** It needs your explicit go-ahead after staging passes. Same steps, plus a backup snapshot first.
