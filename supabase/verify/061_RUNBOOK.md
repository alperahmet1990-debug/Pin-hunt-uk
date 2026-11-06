# Migration 061: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/061_trade_followups.sql`. Never applied by an agent. Apply 060 first.

## What it changes

- Chat participant checks handle a collector who has left.
- Report reasons and trade notes are stored as plain, single line text.
- One waiting proposal per pair of collectors, and up to 20 waiting per collector.
- New chats can't be created with a trade already linked.

Older app builds keep working.

`057_verify.sql` stopped running at 059. `058`, `059`, `060` and `061_verify.sql` all run after this.

## Pre-checks (already done, on a local PGlite replay of the full chain)

The replay's known `006_trade_ratings.sql` failure (T17) was patched in a scratch copy. The repo file is unchanged.

## Release order

1. Staging SQL editor (check the project URL): apply 061.
2. Run `supabase/verify/061_verify.sql`. Expect `ALL 061 CHECKS PASSED`. It rolls itself back.
3. Run `notify pgrst, 'reload schema';`
4. Merge, then publish the OTA update.
5. Device check: a report reason shows in its own box, a blocked collector has no message box, and Trades updates on return.

Production is a separate approval, after 057 to 060.

## Rollback

See the bottom of the migration. It needs the function bodies from 057 and 060, in that order.
