# Migration 079: apply runbook (staging first, then production)

Migration: `supabase/migrations/079_contributed_image_raw.sql`. Verify: `supabase/verify/079_verify.sql`. Never applied by an agent.

Numbering: 076 is used twice on main and 078 is taken by the board-scanning branch (`078_board_scans.sql`). 079 depends on neither. If 079 is taken by the time this merges, renumber this file, the migration and the verify script.

## Why

The photo-to-catalogue flow (scan → "Add your photo" → Pixian clean-up → admin review → catalogue image) now keeps the photo **as the collector took it**, so the admin review page can show **raw | cleaned | Pin & Pop** side by side. The raw photo must be admin-only.

## What it changes (all additive)

- `pin_images.raw_storage_path` (text, nullable): where the raw photo is. Null on older rows.
- Storage bucket `pin-contributed-raw`: **private**. The one storage policy, `pcr_storage_admin_select`, lets admins read. There is no policy for the uploader, other collectors or anon. The API server writes with the service-role key.
- `list_account_storage_objects(uuid)` (from 051): same body, with `pin-contributed-raw` added, so deleting an account removes that user's raw photos.

**Retention (maintainer decision, 14 Nov 2026):** a raw original is deleted, and its `raw_storage_path` cleared, as soon as its contribution is approved or rejected, so the bucket only holds photos still waiting for review. A preview that is never submitted is deleted after 24 hours, from both `pin-contributed-raw` and `pin-contributed-images` (`services/contributed-drafts-cleanup.ts`, run by the API server at start-up and then hourly). The consent step tells collectors both.

Before 079 is applied, the new API code still works. The raw upload fails quietly (logged as a warning), the contribution goes through without a raw original, and the admin page shows "Not kept" in the Raw panel.

## Pre-checks done (local PGlite replay, no hosted database)

- The chain replays with 079. The known `006_trade_ratings.sql` duplicate-policy failure was patched in a scratch copy only. `079_verify.sql` prints `ALL 079 CHECKS PASSED`.
- Adding an owner-read policy to the raw bucket makes `079_verify.sql` fail (check 1d). So the verify does catch a leak.

## Staging

1. Open `079_contributed_image_raw.sql` from the raw file (GitHub "Raw" or a local checkout) and copy the whole file.
2. Staging Supabase SQL editor (check the project URL is staging): run it.
3. Run `supabase/verify/079_verify.sql`. Expect one row: `ALL 079 CHECKS PASSED`. It rolls itself back.
4. The migration ends with `notify pgrst, 'reload schema';`. Run that again if the API reports an unknown `raw_storage_path` column.
5. Device check: see "How to check it works" in the PR description.

## Production (after staging is signed off)

1. Back up production (Supabase dashboard backup).
2. Make sure 038, 042 and 051 are already on production:
   ```sql
   select count(*) from storage.buckets where id = 'pin-contributed-images';            -- 1 (038)
   select count(*) from catalogue_sources where id = 'pin_and_pop';                       -- 1 (042)
   select to_regprocedure('public.list_account_storage_objects(uuid)') is not null;       -- true (051)
   ```
3. Production SQL editor (check the project URL is production): run 079.
4. Run `079_verify.sql`. Expect `ALL 079 CHECKS PASSED`.
5. Deploy the API build from this PR, then the app build.

## Rollback

Nothing reads `raw_storage_path` except the admin queue, so rollback is optional. To undo it:

```sql
-- Re-run section 6 of 051_account_deletion.sql (the original list_account_storage_objects), then:
drop policy if exists "pcr_storage_admin_select" on storage.objects;
-- Empty the bucket in the Storage dashboard first, then:
delete from storage.buckets where id = 'pin-contributed-raw';
alter table pin_images drop column if exists raw_storage_path;
notify pgrst, 'reload schema';
```

The last two statements delete data (raw photos and their paths). Only run them with explicit approval.
