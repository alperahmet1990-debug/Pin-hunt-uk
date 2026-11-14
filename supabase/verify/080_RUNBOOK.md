# Migration 080: apply runbook (staging first, then production)

Migration: `supabase/migrations/080_contributed_image_raw.sql`. Verify: `supabase/verify/080_verify.sql`. Never applied by an agent.

Numbering: 079 is `079_market_price_requests.sql` on main (merged while this PR was open, so this was renumbered from 079), 078 is taken by the board-scanning branch (`078_board_scans.sql`) and 076 is used twice on main. 080 depends on none of them. If 080 is taken by the time this merges, renumber this file, the migration and the verify script.

## Why

The photo-to-catalogue flow (scan → "Add your photo" → Pixian clean-up → admin review → catalogue image) now keeps the photo **as the collector took it**, so the admin review page can show **raw | cleaned | Pin & Pop** side by side. The raw photo must be admin-only.

## What it changes (all additive)

- `pin_images.raw_storage_path` (text, nullable): where the raw photo is. Null on older rows.
- Storage bucket `pin-contributed-raw`: **private**. The one storage policy, `pcr_storage_admin_select`, lets admins read. There is no policy for the uploader, other collectors or anon. The API server writes with the service-role key.
- `list_account_storage_objects(uuid)` (from 051): same body, with `pin-contributed-raw` added, so deleting an account removes that user's raw photos.

**Retention (maintainer decision, 14 Nov 2026):** a raw original is deleted, and its `raw_storage_path` cleared, as soon as its contribution is approved or rejected, so the bucket only holds photos still waiting for review. If that delete fails at review time, the hourly sweep retries it: any reviewed row still pointing at a raw original has it removed and the path cleared. Only JPEG, PNG, WebP and HEIF photos are kept as raw originals (re-encoded as JPEG); other formats, such as SVG or TIFF, are not kept. A preview that is never submitted is deleted after 24 hours, from both `pin-contributed-raw` and `pin-contributed-images` (`services/contributed-drafts-cleanup.ts`, run by the API server at start-up and then hourly). The consent step tells collectors both.

Before 080 is applied, the new API code still works. The raw upload fails quietly (logged as a warning), the contribution goes through without a raw original, and the admin page shows "Not kept" in the Raw panel.

## Pre-checks done (local PGlite replay, no hosted database)

- The chain replays with 080. The known `006_trade_ratings.sql` duplicate-policy failure was patched in a scratch copy only. `080_verify.sql` prints `ALL 080 CHECKS PASSED`.
- Adding an owner-read policy to the raw bucket makes `080_verify.sql` fail (check 1d). So the verify does catch a leak.

## Staging

1. Open `080_contributed_image_raw.sql` from the raw file (GitHub "Raw" or a local checkout) and copy the whole file.
2. Staging Supabase SQL editor (check the project URL is staging): run it.
3. Run `supabase/verify/080_verify.sql`. Expect one row: `ALL 080 CHECKS PASSED`. It rolls itself back.
4. The migration ends with `notify pgrst, 'reload schema';`. Run that again if the API reports an unknown `raw_storage_path` column.
5. Device check: see "How to check it works" below.

## Production (after staging is signed off)

1. Back up production (Supabase dashboard backup).
2. Make sure the migrations this flow needs are already on production. That's 037, 038, 039, 040, 042, 047 and 051; these spot checks cover the ones 080 builds on:
   ```sql
   select count(*) from storage.buckets where id = 'pin-contributed-images';            -- 1 (038)
   select count(*) from catalogue_sources where id = 'pin_and_pop';                       -- 1 (042)
   select to_regprocedure('public.list_account_storage_objects(uuid)') is not null;       -- true (051)
   select count(*) from storage.buckets where id = 'pin-catalogue' and public;           -- 1 (009/011)
   ```
3. Production SQL editor (check the project URL is production): run 080.
4. Run `080_verify.sql`. Expect `ALL 080 CHECKS PASSED`.
5. Production readiness for this flow. Environment settings are owned by the staging/production switch-over plan; check them, don't change them from here.
   - API service: `PIXIAN_API_ID` and `PIXIAN_API_SECRET` set; `PIXIAN_TEST_MODE` unset or not `true` (with `NODE_ENV=production`, test mode disables clean-up). `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` point at production.
   - Buckets: `pin-catalogue` (public), `pin-contributed-images` (private, 038) and `pin-contributed-raw` (private, JPEG-only, 080).
   - Pin & Pop reference rows, so the admin panel has an image to compare: `pin_images` rows with `source = 'pin_and_pop'`, or `pins.external_identifiers.pin_and_pop`. Without them the Pin & Pop panel shows "Not linked" or a link to the Pin & Pop page.
   - The reviewer's production profile has `is_admin = true`.
6. Deploy the API build from this PR, then the app build (TestFlight pointing at production).

## How to check it works (staging first, then production)

1. Signed in as a collector, scan a pin that has no catalogue photo. The result shows "Add your photo".
2. Tap it. Your scan photo is offered. Switch on the rights consent, tap "Use this photo", check the cleaned, watermarked preview, then "Submit Photo".
3. The pin still shows no photo in the catalogue: the photo is waiting for review.
4. As an admin, open Admin → Contributed Photos. The card shows Raw (your photo as taken), Cleaned (what will be published) and Pin & Pop (the reference, if linked).
5. Approve it. Reopen the pin: the watermarked cleaned photo is now its catalogue image. The raw original has gone from `pin-contributed-raw`.
6. Repeat step 2 as an admin. The photo goes to the queue too, unless you switch on "Publish now" on the confirm step.
7. Start a preview and don't submit it. Within 24 hours, its drafts are gone from both buckets (`{your user id}/drafts/`).

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
