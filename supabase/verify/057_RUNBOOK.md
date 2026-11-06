# Migration 057: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/057_trade_lifecycle.sql` (#31, B-P1-07a: server-enforced trade lifecycle).
Never applied by an agent.

## What it changes

- `trades` gains a `problem` status, each side's posted and received dates, carrier and tracking number, and who reported a problem.
- Seven new functions change a trade: `trade_propose`, `trade_accept`, `trade_decline`, `trade_cancel`, `trade_mark_posted`, `trade_mark_received`, `trade_report_problem`. Two internal helpers can't be called by clients.
- Collectors can no longer insert or update `trades` directly. The two permissive write policies are dropped and the grants revoked.
- Existing rows are not changed. Open trades carry on from their current status.

## Pre-checks (already done, on a local PGlite replay of the full chain)

- 057 applies after 001–056. `057_verify.sql` passes, and `050_verify.sql` and `051_verify.sql` still pass after it.
- Weakening each of these made the verify script fail: the grant revoke, the recipient check, the two-sided completion rule, the helper revoke and the block check.

## Release order

Apply 057, then publish the matching app update straight away. Between the two, trade actions fail in the installed app, and older builds can't change trades at all.

1. Staging SQL editor (check the project URL): apply 057.
2. Run `supabase/verify/057_verify.sql`. Expect `ALL 057 CHECKS PASSED`. It rolls itself back.
3. Run `notify pgrst, 'reload schema';`
4. Publish the OTA update from `main` once this PR has merged.
5. Two-account device check: propose, accept, post with tracking, receive on both sides, rate.

Production is a separate approval, after the staging check.

## Rollback

The rollback SQL is at the bottom of the migration. Move any `problem` trades back first; the block does this. Then republish the previous app build's JS, because this app version calls the functions the rollback removes.
