# Migration 052: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/052_catalogue_review_events.sql` (RR-DB1, #320). Never applied by an agent.

## What it changes

- New table `catalogue_review_events`: one row per review decision on a research candidate (045), a catalogue pin,
  or both, optionally naming an external record (`external_source`, `external_id`) for mapping decisions.
- Rows cannot be updated, deleted or truncated by any role. The one allowed change is `actor` becoming null when
  that user's profile is deleted.
- Deleting a candidate, run or pin that has events is refused (`on delete restrict`).
- `created_at` is always the insert time. `run_id` is filled from the candidate and must match it.
- RLS on; admins can read; no write policies. `anon` and `authenticated` have no write grants. The API server
  (service role) is the only writer; no route writes events yet (RR-14, #325).

No existing table, column, policy, grant or row changes.

## Order

Apply **after 049**. 052 does not depend on 050 or 051, so it can go before or after them.

## Pre-checks (done on a local PGlite replay)

```bash
# in a scratch directory outside the repo
npm i @electric-sql/pglite@0.5.7
cp <repo>/supabase/verify/local-replay.mjs .
node local-replay.mjs <repo> --with-045 \
  <repo>/supabase/verify/052_replay_setup.sql \
  <repo>/supabase/verify/045_verify.sql \
  <repo>/supabase/verify/052_verify.sql
```

Expected: `applied 57/58` (the one failure is the existing `006_trade_ratings.sql` duplicate policy, unrelated),
`ALL 045 CHECKS PASSED`, `ALL 052 CHECKS PASSED`. `052_replay_setup.sql` is for the local replay only; it gives the
stub `service_role` the grants and RLS bypass it already has on Supabase.

## Staging

1. Confirm the SQL editor is on the staging project.
2. Paste and run `supabase/migrations/052_catalogue_review_events.sql`.
3. Paste and run `supabase/verify/052_verify.sql`. Expect one row: `ALL 052 CHECKS PASSED`. It runs in one
   transaction and rolls itself back (test users, run, candidates, pin and events are not kept).
4. Optionally re-run `supabase/verify/045_verify.sql`. Expect `ALL 045 CHECKS PASSED`.
5. `notify pgrst, 'reload schema';`
6. Record the output on the PR.

## Production (only after the maintainer approves)

Repeat steps 2–5 on production. Nothing in the app or API reads or writes the table yet, so there is no deploy
ordering.

## Rollback

Run the commented block at the bottom of the migration. Dropping the table discards every recorded event, so export
it first if it holds anything.
