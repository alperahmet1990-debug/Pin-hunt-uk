# Migration 059: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/059_trade_problems_and_deletion_hold.sql`. Never applied by an agent. Apply 058 first.

## What it changes

- A problem report needs a reason, which both collectors can read.
- New admin functions list open reports and close them as completed or cancelled, with an optional note. An admin can't close a report on their own trade.
- `prepare_account_deletion` refuses while the user has an accepted or problem trade.
- New `trades` columns hold the reason, who closed it, when, and the note.

`057_verify.sql` calls the old one-argument `trade_report_problem`, so it no longer runs after 059. Use `058_verify.sql` and `059_verify.sql` from here on.

## Pre-checks (already done, on a local PGlite replay of the full chain)

The replay's known `006_trade_ratings.sql` failure (T17) was patched in a scratch copy. The repo file is unchanged.

- `059_verify.sql`, `058_verify.sql`, `051_verify.sql` and `050_verify.sql` pass.
- Removing the deletion hold, the problem-trade part of it, each admin check, the own-trade check and the reason check each made the script fail.

## Release order

1. Staging SQL editor (check the project URL): apply 059.
2. Run `supabase/verify/059_verify.sql`. Expect `ALL 059 CHECKS PASSED`. It rolls itself back.
3. Run `notify pgrst, 'reload schema';`
4. Deploy the API (automatic on merge), then publish the OTA update. Between steps 1 and 4 reports fail in the installed app.
5. Device check: report a problem with a reason, close it in Admin → Trade Problems, then try deleting an account with an open trade.

Production is a separate approval, after 057 and 058.

## Rollback

See the bottom of the migration. Then republish the previous app JS.
