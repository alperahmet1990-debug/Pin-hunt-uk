---
name: Unread DM badges
description: How unread message tracking works and web-testing pitfalls
---

## Pattern
- Per-participant `a_last_read_at`/`b_last_read_at` on conversations; `mark_conversation_read` RPC (SECURITY DEFINER, auth.uid-guarded).
- Badge polling must NOT use getConversations (it fetches every message). Use the lightweight `get_conversation_unread_counts` RPC — returns only (conversation_id, count).
- UnreadMessagesContext polls the RPC every 30s; screens call `markRead(id)`/`refresh()`.

## Rules learned
- **Mark-read must be gated on screen focus** (useFocusEffect ref + deferred flush): on web, a chat screen restored in the background nav stack mounts and would silently clear unread.
- **Why:** two "regressions" in e2e testing were actually this — and a third was the browser restoring the last chat URL on sign-in, legitimately marking it read.
- **How to apply (testing):** when e2e-testing unread state on web, reset the browser URL to app root before signing in as the recipient, otherwise the restored chat route reads the thread instantly. Also verify the trigger message actually exists in DB before treating missing badges as a bug.
- Side effects (like markRead) must never live inside a setState updater — keep updaters pure; track seen-message ids in a ref.
