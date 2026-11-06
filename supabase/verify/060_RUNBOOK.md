# Migration 060: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/060_trade_way_out.sql` (#138). Never applied by an agent. Apply 059 first.

## What it changes

- `link_conversation_trade` won't replace a link to a pending, accepted or problem trade.
- New `trade_propose_in_chat` proposes and links in one transaction.
- `trade_report_problem` stores the reason on one line.

Older app builds keep working, apart from relinking a chat that already has an open trade.

## Pre-checks (already done, on a local PGlite replay of the full chain)

The replay's known `006_trade_ratings.sql` failure (T17) was patched in a scratch copy. The repo file is unchanged.

- `060_verify.sql`, `059_verify.sql`, `058_verify.sql`, `051_verify.sql` and `050_verify.sql` pass.
- See the PR for the deliberate breakages that made the script fail.

## Release order

1. Staging SQL editor (check the project URL): apply 060.
2. Run `supabase/verify/060_verify.sql`. Expect `ALL 060 CHECKS PASSED`. It rolls itself back.
3. Run `notify pgrst, 'reload schema';`
4. Merge, then publish the OTA update. Proposing from chat needs the new function, so apply 060 first.
5. Device check: Profile → Trades shows active then past. From a chat, propose a trade and open it. Try deleting an account with an open trade, then use View my trades. Block the other collector and confirm the trade still opens from the Trades list. The message box should be gone on a problem or closed trade.

Production is a separate approval, after 057, 058 and 059.

## Rollback

See the bottom of the migration. Then republish the previous app JS, because this version proposes through the function the rollback removes.
