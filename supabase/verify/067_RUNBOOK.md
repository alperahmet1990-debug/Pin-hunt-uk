# Migration 067: apply runbook (staging first; production needs separate approval)

Migration: `067_pin_locations.sql` (iPad: Collecting at home, "where each pin lives"). Never applied by an agent.

## What it changes

- New table `collection_places`: a collector's real-world places (trade books with pages and pockets, display frames, lanyards, boxes).
- New table `user_pin_locations`: which place, page and pocket each pin in a collection lives in. One location per collection entry.
- New trigger on `user_pins`: moving a pin to ISO (`wanted`) clears its location.

Both tables are **owner only**: no access when signed out, and signed-in collectors see only their own rows. The location is deliberately not a column on `user_pins`, because `user_pins_for_trade_read` (006) lets every signed-in user read other collectors' whole For Trade rows.

Locations go with their pin: removing a pin from the collection, deleting a place, or deleting the account (auth.users cascade, 051) removes them.

## Release order

Purely additive: nothing existing changes, so current app builds are unaffected and the order doesn't matter. The app code that reads and writes locations comes in a later PR and needs this applied first.

1. Staging SQL editor, with a guard that stops on any other project: apply `067_pin_locations.sql`.
2. Run `supabase/verify/067_verify.sql`. Expect `ALL 067 CHECKS PASSED`. It rolls itself back.
3. Run `notify pgrst, 'reload schema';`
4. Production: separate approval, then steps 1 to 3 with a guard that stops on staging.

## Pre-checked locally

Replayed with `supabase/verify/local-replay.mjs` (PGlite, no hosted database), with the 006 For Trade read policy added because the stub replay can't load 006: `ALL 067 CHECKS PASSED`. As a control, adding a policy that lets everyone read locations makes check 4c fail, as it should.

## Rollback

At the bottom of the migration. It deletes every saved place and location, so take a copy of both tables first if anyone has used the feature.
