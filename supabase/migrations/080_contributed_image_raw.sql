-- ============================================================
-- Migration 080: keep the raw original of a contributed pin photo (admin-only)
--
-- Never applied by an agent. Apply in the STAGING Supabase SQL editor first,
-- run supabase/verify/080_verify.sql there, then production (separate step).
-- Runbook: supabase/verify/080_RUNBOOK.md.
--
-- Why: a contributed photo (038) is stored only after Pixian has cleaned it
-- (background removed, cropped, centred). When the admin reviews it against
-- the Pin & Pop reference (042), the cleaned result alone can hide a wrong
-- crop or a cut-off pin. The API server now also keeps the photo exactly as
-- the collector took it, so the review page can show raw | cleaned | Pin & Pop.
--
-- What (purely additive):
--   pin_images.raw_storage_path    path of the raw photo in the new bucket;
--                                  null on rows from before this migration.
--   storage bucket pin-contributed-raw   PRIVATE, JPEG only (the API re-encodes
--                                  every raw photo as JPEG without metadata).
--                                  Path {user_id}/{pin}/{ts}.jpg
--                                  (drafts: {user_id}/drafts/...), same layout as
--                                  pin-contributed-images.
--   storage policy pcr_storage_admin_select   admins may read. There is NO
--                                  policy for the uploader or anyone else:
--                                  unlike pin-contributed-images (038), a
--                                  collector cannot read back their own raw
--                                  photo. Uploads, moves and deletes happen
--                                  server-side with the service-role key.
--   list_account_storage_objects   (051) now also lists this bucket, so
--                                  account deletion removes a user's raw photos.
--
-- The raw_storage_path value is only a path; who can see the row is unchanged
-- (pin_images_public_read, 038). Without the storage policy the path is useless.
--
-- Numbering: 079 is 079_market_price_requests.sql on main, 078 is taken by the
-- board-scanning branch (078_board_scans.sql) and 076 is used twice on main.
-- 080 depends on none of them.
--
-- Run AFTER 038, 042 and 051.
-- ============================================================

-- ── pin_images.raw_storage_path ──────────────────────────────────────────────

alter table pin_images
  add column if not exists raw_storage_path text;

comment on column pin_images.raw_storage_path is
  'Contributed photos only: the un-cleaned original in the private, admin-only pin-contributed-raw bucket (080).';

-- ── Storage: private, admin-only pin-contributed-raw bucket ──────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pin-contributed-raw',
  'pin-contributed-raw',
  false,
  10485760,
  array['image/jpeg']
)
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];

drop policy if exists "pcr_storage_admin_select" on storage.objects;
create policy "pcr_storage_admin_select"
  on storage.objects for select
  using (bucket_id = 'pin-contributed-raw' and public.is_admin());

-- ── Account deletion (051): include the new bucket ───────────────────────────
-- Same body as 051 with 'pin-contributed-raw' added to the list.

create or replace function public.list_account_storage_objects(p_user uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select o.bucket_id::text, o.name::text
  from storage.objects o
  where p_user is not null
    and o.bucket_id in (
      'avatars', 'community-photos', 'pin-submissions',
      'pin-contributed-images', 'pin-contributed-raw', 'user-pin-images', 'scan-images')
    and split_part(o.name, '/', 1) = p_user::text
  order by o.bucket_id, o.name
  limit 10000;
$$;

revoke all on function public.list_account_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.list_account_storage_objects(uuid) to service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- End of migration 080.
-- ============================================================
