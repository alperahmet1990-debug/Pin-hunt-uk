# Migration 058: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/058_trade_ratings_and_hardening.sql` (#33, B-P1-08). Never applied by an agent.

## What it changes

- New function `trade_rate`. Ratings are added only through it, for a completed trade the caller took part in.
- `trade_assert_may_commit` also checks the other collector. `trade_mark_posted` applies that check only to the first post.
- `trades`, `trade_items` and `trade_ratings` keep client read access only. The app has no writer for `trade_items`.
- Ratings get a 500-character comment limit, for new rows, and the unique rule no longer counts ratings whose trade was removed.
- Existing ratings are not changed.

## Pre-checks (already done, on a local PGlite replay of the full chain)

The replay's known `006_trade_ratings.sql` failure (T17) was patched in a scratch copy, so the ratings table exists there. The repo file is unchanged.

- `058_verify.sql` passes. `050`, `051` and `057_verify.sql` still pass after it.
- Removing the completed-trade check, the counterparty check, the first-post condition, the unique change, the rater check and the revoke each made the script fail.

## Release order

Apply 058, then publish the matching app update straight away. Between the two, rating fails in the installed app.

1. Staging SQL editor (check the project URL): apply 058.
2. Run `supabase/verify/058_verify.sql`. Expect `ALL 058 CHECKS PASSED`. It rolls itself back.
3. Run `notify pgrst, 'reload schema';`
4. Publish the OTA update from `main` once this PR has merged.
5. Device check: complete a trade and rate it from both accounts.

Production is a separate approval, and 057 must go first.

## Rollback

The rollback SQL is at the bottom of the migration. Then republish the previous app JS.
