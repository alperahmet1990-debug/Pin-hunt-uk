# Migration 048: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/048_contributor_catalogue_coverage.sql` (#396). Never applied by an agent.

## What it changes

It replaces one function, `get_catalogue_image_coverage()`, in a single transaction:

- **Wider:** it now returns every verified, searchable, non-archived pin, not just Collectible PinTrader pins.
  Access is still gated by `can_access_feature('catalogue_contributions')`.
- **More columns:** it adds `origin`, `main_character`, `all_characters`, `catalogue_source`, `needs_back_image` and
  `missing_fields`. The original columns come first, in the same order, so current app builds keep working.
- **Execute permission:** `revoke all … from public` plus `grant execute … to authenticated`. Anonymous callers
  already got no rows; now they can't call it at all.

It changes no tables, rows or policies.

## Pre-checks (done locally)

PGlite replay of 001–047, then 048, then `supabase/verify/048_verify.sql`: **ALL 048 CHECKS PASSED**.

## Staging

1. In the staging project's SQL editor, run `048_contributor_catalogue_coverage.sql`.
2. Run `supabase/verify/048_verify.sql`. Expect `ALL 048 CHECKS PASSED`. It rolls itself back and needs at least
   one profile row.
3. Open **Help Build the Catalogue** as an admin. Check that pins from sources other than Collectible PinTrader now
   appear, and try the Year, Park, Character and Set filters.

## Production (after approval)

Apply 048 any time after 047. The app is fine in either order: before 048 the new filters just show fewer options.

## Rollback

Run the commented block at the bottom of the migration. It restores the 039 definition exactly.
