# Migration 072: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/072_reported_message_review.sql` (#504, #524). Never applied by an agent. Needs 050 and 051. It does not need 062–071. Migration 071 is taken by draft PR #582 (trade chat events); the two are independent and can be applied in either order.

If another migration has taken 072 by the time this merges, renumber this file, the migration and its verify script.

## What it changes

- `conversation_messages.removed_at` (nullable). Set only when moderators remove a message. New messages always start with it empty, and a removed message can't be edited afterwards.
- `message_moderation_events`: one row per moderator view or removal (who, when, which report, and the removal reason). Admins can read it. Only the two functions below write it.
- `get_reported_message(report_id)`: signed-in admins only. For a report that is still open, returns that one message (not the conversation) and records the view. Returns `gone` once the report is dismissed.
- `remove_reported_message(admin_id, message_id, reason)`: service role only, called by `POST /api/admin/messages/:id/remove`. Needs an open report. Replaces the text with "Removed by PinHunt moderators", clears photos and pin shares, records the removal with its reason (1–500 characters) and returns the photo files, which the API deletes from `community-photos`.
- Unchanged: who can read, send or report messages, `user_reports` and its policies, and the 032/033 validation triggers (a removed message is a `text` message with no attachments, which they accept).

## Release order

The app and API work before and after the migration:

- Before it's applied, "Show message" on a report card shows "Reported messages can't be shown yet." and the remove route answers 503.
- Older app builds ignore `removed_at` and show the placeholder text as a normal message.

1. Staging SQL editor. The migration's first block is a project guard: it stops unless `target` (default `'staging'`) matches `pinhunt_environment()`, the one-line marker created once per project (see `073_RUNBOOK.md`). Apply 072.
2. Run `supabase/verify/072_verify.sql`. Expect `ALL 072 CHECKS PASSED`. It rolls itself back. If the hosted project refuses the test row in `storage.objects`, the photo checks are skipped with a notice (6h–6k); the API tests cover the storage step.
3. `notify pgrst, 'reload schema';` (also at the end of the migration).
4. Deploy the API (Render, staging) so `/api/admin/messages/:id/remove` exists. Merge, then publish the app update.
5. Device check with staging accounts A, B and an admin:
   - B sends A a text, a photo and a pin share. A reports each one.
   - Admin: Community Moderation → each message card → Show message. Text, photos and pin IDs appear. Nothing else from the conversation appears.
   - Admin: Remove message → enter a reason → Remove. The card shows "Removed by moderators" with the reason.
   - A and B reload the chat: both see "Removed by PinHunt moderators" in place of each removed message. The other messages are unchanged. The photo URL no longer loads.
   - The report is still on the queue until dismissed. After Dismiss, Show message (if reopened) says the message is no longer available.
   - A non-admin can't reach the moderation screen, and a direct call to the route with their token gets 403.
6. Production: separate approval, after 057–061 are on production. Create the production marker if it isn't there yet (`073_RUNBOOK.md`). Set `target := 'production'` in both the migration and the verify script (the only edit), then steps 2–5 with the production project.

## Pre-checks done (local PGlite replay of the full chain, no hosted database)

- The chain replays with 072 (with the known `006_trade_ratings.sql` duplicate-policy failure patched in a scratch copy only).
- `072_verify.sql` passes, including the photo checks.
- `050`, `051` and `059_verify.sql` still pass after 072. (`057_verify.sql` already fails on `main`: later migrations replaced one of the functions it checks.)

## Rollback

At the bottom of the migration. Removed messages keep their placeholder text; deleted photos can't be restored. Dropping `message_moderation_events` deletes the view and removal record, so export it first if it's needed.
