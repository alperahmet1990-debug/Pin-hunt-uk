# Migration 066: apply runbook (staging first; production needs separate approval)

Migration: `066_contact_preferences.sql` (#505). Never applied by an agent.

## What it changes

- "Allow Messages" off: nobody can start a new chat with that collector.
- "Allow Trade Requests" off: nobody can send that collector a new trade proposal, directly or in chat.
- Existing chats, messages and trades carry on. Blocking still ends contact.
- `collector_contact_preferences(uuid)` lets the app show or hide Message and Propose Trade.

## Before applying

- **066 replaces `trade_propose` from 061**, so 057 to 061 must already be applied on that database. Production didn't have 057 to 061 on 6 Nov 2026. Apply those first, following `061_RUNBOOK.md`.
- If another migration has taken 066, renumber this file and its verify script.

## Release order

The app works before and after the migration. Older builds also work, but anyone they try to contact who has opted out gets a plain error rather than a friendly message.

1. Merge, then publish the OTA update. Rebuild the contributor website if it's live.
2. Staging SQL editor, with a guard that stops on any other project: apply 066.
3. Run `supabase/verify/066_verify.sql`. Expect `ALL 066 CHECKS PASSED`. It rolls itself back.
4. Run `notify pgrst, 'reload schema';`
5. Device check with two staging accounts:
   - B turns off Allow Messages. A sees no Message button on B's profile, and opening a message link to B shows that B isn't taking new messages.
   - B turns off Allow Trade Requests. A can't propose a trade in an existing chat with B, and sees a clear message.
   - An existing chat between A and B still works.
6. Production: separate approval. Use a guard that stops on staging, then steps 3 to 5.

## Rollback

At the bottom of `066_contact_preferences.sql`. It removes the trigger and the function, and restores `trade_propose` by re-running section 2 of 061.
