# Migration 053: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/053_external_id_links.sql` (#433, epic #431). Never applied by an agent.
Backfill (separate, human-run): `supabase/data/053_backfill_pin_and_pop_links.sql`.

## What it changes

All additive. No existing column, policy, constraint, index or row is changed or removed.

- **`catalogue_sources`:** registers `pinpics`, `pintradingdb` and any other `source` value already in
  `pin_external_ids`. Every rights flag is `false`. Existing rows (`collectible_pintrader`, `pin_and_pop`) are not touched.
- **`pin_external_ids`:** nullable columns `match_status`, `match_method`, `confidence`, `confirmed_by`
  (→ `profiles`, on delete set null), `confirmed_at`, `last_seen_at`, `source_payload_hash`, with CHECKs, and an
  index on `(source, match_status)`. Existing rows keep NULL metadata.
- **Foreign key** `pin_external_ids.source` → `catalogue_sources(id)`, added `NOT VALID` and then validated.
- **RLS:** a new restrictive select policy `pin_external_ids_rights_gate`. Pin & Pop links (`pin_and_pop`, and the
  legacy spreadsheet label `pin_pop`) are readable only by admins while that source's `public_display_allowed` is
  `false`. Every other source stays readable exactly as before through the unchanged `pin_external_ids_public_read`.
  The service role is unaffected.

## Pre-checks (done locally)

PGlite replay (`supabase/verify/local-replay.mjs`) of 001–049 + 053 (one profile row seeded), then
`045_verify.sql`, `047_verify.sql`, `048_verify.sql`, `049_verify.sql` and `053_verify.sql`: all passed.
A second replay seeded legacy `pin_external_ids` rows (`ebay`, `pin_pop`, `pinpics`, `collectible_pintrader`,
`pin_and_pop`) before 053, then ran 053, `053_verify.sql`, the backfill (preview, apply, apply again), the
backfill rollback, the 053 rollback, and 053 again.

## Staging

1. Read-only pre-check. Note the result; every value listed will be registered as a source with no rights.

   ```sql
   select e.source, count(*) as links, (cs.id is not null) as already_registered
     from pin_external_ids e left join catalogue_sources cs on cs.id = e.source
    group by e.source, cs.id order by e.source;
   ```

2. Run `053_external_id_links.sql`.
   - If the last statement (`validate constraint pin_external_ids_source_fkey`) fails, a row with an unregistered
     source was written while the migration ran. If the run was not rolled back as a whole, the key is still
     enforced for new writes (`NOT VALID`). Re-run the step 1 query, then re-run the whole file: it is idempotent and
     registers the missing value before validating.
3. Run `notify pgrst, 'reload schema';`.
4. Run `supabase/verify/053_verify.sql`. Expect `ALL 053 CHECKS PASSED`. It rolls itself back and needs at least one
   profile row. It never changes a rights flag.
5. Re-run `045_verify.sql`, `047_verify.sql`, `048_verify.sql`, `049_verify.sql`. Each should still pass.
6. Backfill (separate step, after 053 passes):
   1. Run `supabase/data/053_backfill_pin_and_pop_links.sql` as is. It ends in `rollback;`, so it only previews.
      Check the action counts. Expected: up to 96 `insert`; 86 `skip: repurposed pinhunt_id (#432)`.
   2. If right, change the last line to `commit;` and run it again. Re-running is safe.
   3. Check: `select count(*) from pin_external_ids where source = 'pin_and_pop';` as postgres, and confirm a
      signed-in non-admin session in the app/API cannot read those rows.
7. Run the Collectible PinTrader importer in `--dry-run` against staging and `copy-catalogue-to-staging.mjs` without
   `--apply`; both should report as before.

## Production (after separate approval)

Repeat steps 1–6 on production, in the same order, then `notify pgrst, 'reload schema';`.
Apply the backfill only after 053 and its verification pass there.

## Rollback

1. If the backfill was committed: run the rollback block at the bottom of the backfill file.
2. Run the commented rollback block at the bottom of the migration, then `notify pgrst, 'reload schema';`.
   Dropping the columns discards any link metadata recorded since 053.

## Known effects

- Legacy importers that write free-form source labels (`scripts/import-catalogue.ts`, `scripts/bulk-import.*`) now
  need the label registered in `catalogue_sources` first, or the insert fails on the foreign key. The Collectible
  PinTrader importer only writes registered sources (`collectible_pintrader`, `pinpics`, `pintradingdb`).
- `pins.external_identifiers` (which also holds the Pin & Pop id for trusted pins) is governed by the `pins` policies
  and is not changed here.
