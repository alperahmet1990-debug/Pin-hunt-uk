# Migration 047: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/047_contributor_submissions.sql` (Early Contributor Programme, photo-only submissions).
Never applied by an agent.

## What it changes

- `pin_submissions.proposed_name` and `brand` lose `NOT NULL`. This is the only non-additive change. No rows change.
- New columns on `pin_submissions`: `rights_confirmed_at`, `ai_identification`, `original_metadata`.
- New trigger `pin_submissions_provenance`: takes a snapshot of the original submission on insert. It stops edits
  changing that snapshot or the AI hints, and stops anyone withdrawing a rights confirmation.
- New table `contributor_ai_usage` (RLS on, no policies, so it is service role only). It holds the daily caps and
  saved results for repeat requests.
- New index `ps_submitted_by_created_idx`.

Policies, grants on existing tables and the storage buckets are all unchanged.

## Pre-checks (already done, on a local PGlite replay of the full chain)

- 047 applies cleanly after 001–045.
- `supabase/verify/047_verify.sql` passes: photo-only insert, provenance capture, forged-value rejection,
  edit immutability, shape limits, no app access to the usage table.
- Rollback (bottom of the migration) restores `NOT NULL` after giving any unnamed rows placeholders, and drops
  every new object.

The replay is `supabase/verify/local-replay.mjs`. A profile row has to be seeded first, otherwise verify section 2 skips.

## Staging

1. In the staging project's SQL editor, run `047_contributor_submissions.sql`.
2. Run `supabase/verify/047_verify.sql`. Expect one row: `ALL 047 CHECKS PASSED`. It rolls itself back.
3. Deploy the API server from the PR branch against staging. Then:
   - Submit a photo-only pin with `rightsConfirmed: true`. It should appear in the admin queue with an empty name.
   - Preview the same photo twice. The second response says `reused: true`.
   - Optional: set `CONTRIBUTOR_DAILY_CLEANUPS=1` on staging, then check that a second different photo comes back
     with `cleanupSkipped: "limit"` and still submits.

## Production (only after the maintainer approves)

The order matters:

1. **Migration 047**
2. **API server**. Before 047 the new API still accepts named submissions from current app builds, but photo-only
   submissions fail with a database error.
3. **App / web release** with the photo-only flow.

## API settings (optional)

| Variable | Default | Meaning |
|---|---|---|
| `CONTRIBUTOR_DAILY_SCANS` | 60 | AI identifications per user per rolling 24h |
| `CONTRIBUTOR_DAILY_CLEANUPS` | 60 | Pixian clean-ups per user per 24h (over the cap: raw photo kept, never blocks) |
| `CONTRIBUTOR_DAILY_SUBMISSIONS` | 40 | Submissions per user per 24h |

Admins are never capped. Caps fail open if the table is missing or the database errors.

## Rollback

Run the commented block at the bottom of the migration, in order. It is lossy for unnamed submissions: they get
`'Unidentified pin'` / `'Unknown'`. Export `original_metadata` first if it is needed. Roll the API back first, or
named submissions keep working but photo-only submissions fail.
