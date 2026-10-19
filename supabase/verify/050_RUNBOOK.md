# Migration 050: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/050_user_blocks_reports_suspensions.sql` (#16, B-P0-05a: block and report users, account suspension).
Never applied by an agent.

## What it changes

- New table `user_blocks` (RLS: each user reads, adds and removes only their own blocks).
- New table `user_reports` for profile and message reports (RLS: reporter and admins read; admins dismiss).
- New table `user_suspensions` (RLS: admins only; suspending an admin needs the App Creator).
- New functions `is_current_user_suspended()`, `is_blocked_with(uuid)`, `conversation_has_block(uuid)`,
  `trade_has_block(uuid)`. They are SECURITY DEFINER, answer only about the signed-in user, and are not executable by `anon`.
- Seven new **restrictive** policies on `community_posts` (insert, update), `post_comments`, `conversations`,
  `conversation_messages`, `trade_messages` and `trades` (insert). Existing policies are not touched; restrictive policies
  can only narrow what they allow.

No existing table, column, row or policy is changed or removed.

## Pre-checks (already done, on a local PGlite replay of the full chain)

- 050 applies cleanly after 001–049, and applies a second time without errors.
- `supabase/verify/050_verify.sql` passes.
- Each policy was weakened in turn on the replay; the verify script failed at the matching check every time.
- The rollback below removes every 050 object and leaves the 18 pre-existing content-table policies in place.

Replay: `node supabase/verify/local-replay.mjs <repo> --with-045 <repo>/supabase/verify/050_verify.sql`
(after `npm i @electric-sql/pglite@0.5.7` in a scratch directory).

## Staging

1. Confirm 040 is applied on staging (`select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'is_app_creator';`).
2. In the staging SQL editor, run `050_user_blocks_reports_suspensions.sql`.
3. Run `supabase/verify/050_verify.sql`. Expect one row: `ALL 050 CHECKS PASSED`. It creates throwaway users inside a
   transaction and rolls itself back.
4. `notify pgrst, 'reload schema';`
5. Smoke test with the two staging test accounts in the current app build: send a DM, create a post, comment, propose a trade.
   All should work as before (no one is blocked or suspended).

## Production (only after the maintainer approves)

1. Run the migration in the production SQL editor.
2. Run `050_verify.sql` (it rolls back).
3. `notify pgrst, 'reload schema';`

No app or API release has to go first: the current app does not call the new tables, and the new policies only affect
users who are blocked or suspended.

## Rollback

Run the commented block at the bottom of the migration, then `notify pgrst, 'reload schema';`. It deletes all blocks,
reports and suspensions, so export them first if they are needed.
