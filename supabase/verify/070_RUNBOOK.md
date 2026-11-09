# Migration 070: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/070_trade_items.sql`. Never applied by an agent. Apply 061 first. It does not need 062–069; in particular it works with or without 066.

## What it changes

- A trade records the pins being swapped. Each item keeps the catalogue pin, a copy of its PinHunt ID and title, and a quantity. `offered` pins come from the collector who proposed; `requested` pins come from the other collector.
- `trade_propose_in_chat(conversation, notes, items)` writes the pins with the proposal. A proposal needs at least one pin (at most 12 each way).
- `trade_set_items(trade, items)`: either collector can change the pins while the trade is waiting. Each change bumps `trades.items_version`.
- `trade_accept(trade, items_version)` refuses a trade with no pins, and refuses if the pins changed since the version the app showed.
- Once a trade is accepted (or declined, cancelled, completed), its pins can't change. A trigger enforces this for every writer.
- `trade_items.user_pin_id` is now optional and `ON DELETE SET NULL` (was `RESTRICT`), so a collector can remove a traded pin from their collection afterwards. The item keeps its copy of the pin.
- Admins can read trade items, so problem reviews show what was agreed.

## Release order

Older app builds can't send pins. After 070 their Propose Trade is refused with "Choose at least one pin for this trade.", and their Accept still works for trades that have pins. Publish the matching app update straight after applying.

1. Staging SQL editor (check the project URL): apply 070.
2. Run `supabase/verify/070_verify.sql`. Expect `ALL 070 CHECKS PASSED`. It rolls itself back.
3. Run `notify pgrst, 'reload schema';`
4. Merge, then publish the app update.
5. Device check with the two staging accounts: propose with pins from chat, change a pin from the other account, accept, and confirm the trade screen shows the agreed pins and they can no longer be changed.

Production is a separate approval, after 057 to 061.

## Pre-checks (done on a local PGlite replay of the full chain)

- The chain replays with 070 (with the known `006_trade_ratings.sql` duplicate-policy failure, T17, patched in a scratch copy only).
- `070_verify.sql` passes with and without 066 in the chain.
- `058`, `059`, `061` and `066_verify.sql` still pass after 070.
- `060_verify.sql` no longer runs after 070: it checks the old `trade_propose_in_chat(uuid, text)` signature, which 070 replaces.
- The rollback block below, followed by the 061 and 057 function bodies, returns to a state where `061_verify.sql` passes.

## Rollback

See the bottom of the migration. Items whose collection row was removed after 070 are deleted first, because the old `NOT NULL` needs it. Then re-run `trade_propose_in_chat` from 061 and `trade_accept` from 057 (each with its revoke/grant), then `notify pgrst, 'reload schema';`.
