# Migration 071: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/071_trade_chat_events.sql`. Never applied by an agent. Apply 070 first. Works with or without 066.

## What it changes

- Every trade step writes one line into the trade's chat, sent as the collector who took the step: proposed, pins changed, accepted, declined, cancelled, posted, received, completed, problem reported. The other collector's unread badge goes up through the existing unread counts (026). No app change is needed for that.
- Nothing is written when the two collectors have blocked each other, when either is suspended, when the trade has no chat, or when an admin closes a problem report. Only the chat the two already share is used, so contact preferences (066) aren't bypassed.
- `conversation_messages.trade_id` and `trade_event` mark these lines. Clients can't write them.
- `trades_waiting_for_me()` counts the caller's trades where the next step is theirs, for "N trades need you".

Older app builds keep working. They show the lines as ordinary text from the collector who took the step.

## Release order

1. Staging SQL editor (check the project URL): apply 071 (after 070).
2. Run `supabase/verify/071_verify.sql`. Expect `ALL 071 CHECKS PASSED`. It rolls itself back.
3. Run `notify pgrst, 'reload schema';`
4. Merge, then publish the app update.
5. Device check with the two staging accounts: each step (propose, accept, post, received) raises the other account's unread badge; Home shows "N trades need you" and Profile's Trades row shows the badge, and both drop once the step is taken.

Production is a separate approval, after 070.

## Pre-checks (done on a local PGlite replay of the full chain)

- The chain replays with 070 and 071 (the known `006_trade_ratings.sql` T17 failure is patched in a scratch copy only).
- `071_verify.sql` passes with and without 066 in the chain.
- `050`, `051`, `058`, `059`, `061`, `066` and `070_verify.sql` still pass after 071.
- The rollback block below runs, and `070_verify.sql` passes afterwards.

## Rollback

See the bottom of the migration. Lines already written stay in the chats as ordinary text messages.
