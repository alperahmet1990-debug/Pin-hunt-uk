-- ============================================================
-- Migration 038: User-contributed canonical pin images
--
-- Lets a user who scans a pin with no catalogue image contribute a
-- clean photo of their own pin, pending admin review, to become that
-- pin's public display image. Purely additive — no existing column,
-- table, or policy is dropped (pin_images_public_read is replaced with
-- a tighter version, see below).
--
-- Also closes a pre-existing RLS gap: pin_images_public_read
-- (002_rls.sql) was `USING (true)`, exposing every row regardless of
-- public_display_allowed — needed to be fixed before this feature could
-- safely insert pending/rejected rows into the same table.
--
-- Run AFTER 001–037, in the Supabase SQL editor.
-- ============================================================

-- ── pin_images: contribution review state ──────────────────────────────────

alter table pin_images
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists contributor_consent_at timestamptz,
  add column if not exists reviewer_notes text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- Existing rows (none today — pin_images is unpopulated) default to
-- 'pending', which is harmless since public read now also requires
-- public_display_allowed = true (see below) and nothing currently sets
-- public_display_allowed = true anywhere.

-- ── pin_images RLS: fix public read, add contributor + admin policies ──────

drop policy if exists "pin_images_public_read" on pin_images;
create policy "pin_images_public_read" on pin_images
  for select using (
    public_display_allowed = true
    or uploaded_by = auth.uid()
    or is_admin()
  );

create policy "pin_images_insert_own_pending" on pin_images
  for insert with check (
    uploaded_by = auth.uid()
    and status = 'pending'
    and public_display_allowed = false
  );
-- No update/delete policy for contributors — a submitted photo is
-- immutable; resubmitting after rejection creates a new row.

create policy "pin_images_admin_all" on pin_images
  for all using (is_admin()) with check (is_admin());
-- Covers admin select/update/delete of any row. The approve/reject API
-- route uses the service-role key anyway (bypasses RLS entirely), same
-- as every other admin write path in this repo — this policy mainly
-- lets admin UI list pending rows through the normal anon-key client.

-- ── Storage: private pin-contributed-images bucket ──────────────────────────
-- Mirrors the pin-submissions bucket pattern (005_pin_submissions_v2.sql).
-- Path convention: {user_id}/{pin_id}/{timestamp}.jpg — the RLS policies
-- below only care that the first path segment is the uploader's own
-- auth.uid(), same requirement pin-submissions enforces.
--
-- No INSERT policy for users: the upload happens server-side (the API
-- server normalizes every photo via Pixian before storing it, so the
-- Pixian key never reaches the client — see routes/contribute-pin-image.ts)
-- using the service-role key, which bypasses RLS entirely. Only SELECT is
-- exposed to the contributor's own session, kept for a possible future
-- "my submissions" preview screen.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pin-contributed-images',
  'pin-contributed-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "pci_storage_select_own" on storage.objects;
create policy "pci_storage_select_own"
  on storage.objects for select
  using (
    bucket_id = 'pin-contributed-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
-- No update/delete storage policy for users — pending uploads are
-- immutable, same rationale as the table-level policy above. Admin
-- review reads go through the service-role key, which bypasses this.

-- ============================================================
-- End of migration 038.
-- ============================================================
