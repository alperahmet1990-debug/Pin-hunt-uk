# Migration 074: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/074_trade_clean_text_ascii.sql`. Never applied by an agent. Needs 061. It does not need 062-073. Migrations 070, 071 and 073 are taken by draft PRs #581, #582 and #586; 074 is independent of them and can be applied in any order with them.

If another migration has taken 074 by the time this merges, renumber this file, the migration, `074_verify.sql` and `074_equivalence.mjs`.

## Why

061 defines `trade_clean_text(text)` with the invisible characters typed literally inside its two regular expressions. Copying the file from a browser into the SQL editor dropped or changed some of them, and the function then failed with `invalid regular expression: invalid character range`. Every trade proposal failed on production (found on 11 Nov 2026 by `061_verify.sql` check 3a). The maintainer hot-fixed production by hand with an ASCII-escaped version.

074 records that fix in the repo. It re-creates `trade_clean_text` with every character written as an escape, so the file is plain ASCII and survives copy and paste. Same characters, same output, same signature, same grants (`revoke all` from public, anon and authenticated; only the security-definer trade functions call it).

## What it changes

- `public.trade_clean_text(text)`: function body only.
- Nothing else. No tables, policies or data.

## Pre-checks done (local PGlite replay, no hosted database)

- `074_equivalence.mjs`: 061's function and 074's function loaded side by side give identical output on 317,455 inputs (every BMP code point except surrogates, plus four outside it, each alone, doubled, between letters and between spaces) and on 20,006 random mixes of the listed characters with ordinary text, tabs, newlines, NBSP, U+2028 and U+2029. 0 differ. Both remove the 22 listed format characters and turn the 83 listed space-like characters into a space.
- The full chain replays with 074 (with the known `006_trade_ratings.sql` duplicate-policy failure patched in a scratch copy only). `074_verify.sql`, `061_verify.sql` and `060_verify.sql` pass after it.
- `074_verify.sql` fails (check 2a) when run against 061's version, so it does tell the two apart.

## Release order

The app and API don't change. Older app builds keep working.

1. Open `074_trade_clean_text_ascii.sql` from the raw file (GitHub "Raw" or a local checkout). The file is ASCII, so this is safer than before, but copy the whole file.
2. Staging SQL editor (check the project URL): apply 074.
3. Run `supabase/verify/074_verify.sql`. Expect `ALL 074 CHECKS PASSED`. It rolls itself back.
4. Optional: run `061_verify.sql` too. Expect `ALL 061 CHECKS PASSED`.
5. `notify pgrst, 'reload schema';` (also at the end of the migration).
6. Device check with two staging accounts: propose a trade from chat with a note that has a line break. The proposal goes through and the note shows on one line.
7. Production: separate approval. Production already runs the hand-written fix; applying 074 there replaces it with the same function from the repo, so the two can't drift. Then steps 3-5 on production.

## Rollback

Re-run section 1 of `061_trade_followups.sql` (the `create or replace function trade_clean_text` and its `revoke`), copied from the raw file. The output is identical, so nothing else needs undoing. That text is the version that breaks when pasted through a browser, so rolling back gives no benefit and brings back the risk.

## Repo check

`scripts/sql-invisible-chars.test.mjs` (part of `pnpm test`) fails if a non-comment line in `supabase/migrations/*.sql` or `supabase/verify/*.sql` contains an invisible or format character. The lines already in 061 and `061_verify.sql` are listed as known; existing migrations are never edited.
