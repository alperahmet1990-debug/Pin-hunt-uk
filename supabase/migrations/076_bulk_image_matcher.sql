-- ============================================================
-- Migration 076: Admin Bulk Image Matcher (staging first)
--
-- DRAFT, L3. Never applied by an agent. Apply in the STAGING Supabase SQL
-- editor first, run supabase/verify/076_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval.
--
-- An App Creator uploads a batch of photographs of individual pins
-- (independently supplied, with recorded permission), the API server
-- suggests catalogue matches, the admin confirms them, the confirmed photo
-- is cleaned with Pixian, and the approved result is published as the pin's
-- catalogue image. Code: artifacts/api-server/src/routes/bulk-images.ts,
-- services/bulkImages/*, app/admin/bulk-images/*.
--
-- Rights: every batch records who supplied the photos, the permission basis
-- and licence, and whether public display is allowed. The API refuses to
-- publish from a batch without public display permission. Published images
-- become pin_images rows with source = 'pinhunt_bulk_upload' and
-- source_record_id = bulk_image_items.id, so each catalogue image traces
-- back to its batch and permission record. Pin & Pop images are never
-- copied into these tables or this bucket (suggested candidates store
-- PinHunt ids only; reference URLs are looked up at review time).
--
-- Numbering: 075 is taken by the board-scanning branch (075_board_scans.sql).
-- This file does not depend on it and touches none of its objects.
--
-- Purely additive: two new tables, one private storage bucket, one
-- catalogue_sources row. No existing table, column, policy or constraint
-- changes. Writes go through the API server's service-role key; RLS below
-- only opens reads to admins. Safe to run more than once.
--
-- Run AFTER 074.
--
-- Rollback (safe — nothing else references these):
--   drop table if exists bulk_image_items;
--   drop table if exists bulk_image_batches;
--   -- storage objects must be removed with the Storage API (service role),
--   -- then: delete from storage.buckets where id = 'bulk-image-matcher';
--   -- only if no pin_images row uses it:
--   delete from catalogue_sources where id = 'pinhunt_bulk_upload';
-- ============================================================

-- ── Source for published bulk-matched photos ─────────────────────────────────

insert into catalogue_sources (
  id, display_name, attribution_text, rights_basis, exact_license_variant,
  public_display_allowed, storage_allowed, app_use_allowed, attribution_required, notes
) values (
  'pinhunt_bulk_upload',
  'PinHunt catalogue photos',
  'Photo: PinHunt',
  'Photographed by or supplied to PinHunt with recorded permission, per batch in bulk_image_batches',
  null,
  true, true, true, false,
  'Per-batch supplier, permission basis and licence live on bulk_image_batches. Only batches with permission_public_display = true can be published.'
) on conflict (id) do nothing;

-- ── bulk_image_batches: one uploaded set of photos ───────────────────────────

create table if not exists bulk_image_batches (
  id                         uuid        primary key default gen_random_uuid(),
  created_by                 uuid        references auth.users(id) on delete set null,
  title                      text        not null check (char_length(title) between 1 and 120),
  status                     text        not null default 'open' check (status in ('open', 'archived')),
  -- Provenance / permission (required before anything is uploaded).
  supplier_name              text        not null check (char_length(supplier_name) between 1 and 200),
  permission_basis           text        not null
                               check (permission_basis in ('own_photos', 'written_permission', 'licence', 'other')),
  licence                    text,
  permission_public_display  boolean     not null default false,
  permission_notes           text,
  permission_recorded_by     uuid        references auth.users(id) on delete set null,
  permission_recorded_at     timestamptz not null default now(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists bulk_image_batches_created_idx on bulk_image_batches (created_at desc);

-- ── bulk_image_items: one photo in a batch ───────────────────────────────────
-- Status flow:
--   uploaded → matching → suggested | unmatched          (automatic)
--   suggested | unmatched | flagged → confirmed | skipped | flagged (review)
--   confirmed → cleaning → cleaned                        (automatic, Pixian)
--   cleaned → published                                   (admin approves)
--   any automatic step can end in failed (failed_stage says which); retry
--   puts the item back at the start of that stage only.

create table if not exists bulk_image_items (
  id                     uuid        primary key default gen_random_uuid(),
  batch_id               uuid        not null references bulk_image_batches(id) on delete cascade,
  created_by             uuid        references auth.users(id) on delete set null,
  status                 text        not null default 'uploaded'
                           check (status in ('uploaded', 'matching', 'suggested', 'unmatched', 'flagged',
                                             'skipped', 'confirmed', 'cleaning', 'cleaned', 'published', 'failed')),
  failed_stage           text        check (failed_stage in ('match', 'clean', 'publish')),
  error                  text,

  -- The uploaded photo (private bucket bulk-image-matcher, EXIF stripped).
  original_filename      text,
  original_path          text        not null,
  original_sha256        text        not null,
  width                  integer,
  height                 integer,

  -- Automatic matching. candidates holds PinHunt ids + metadata only.
  match_attempts         integer     not null default 0,
  matching_started_at    timestamptz,
  matched_at             timestamptz,
  candidates             jsonb       not null default '[]'::jsonb,
  description            jsonb,
  top_confidence         integer,
  match_band             text        check (match_band in ('confident', 'possible', 'uncertain', 'none')),
  match_verified         boolean     not null default false,

  -- Review.
  matched_pinhunt_id     text,
  match_method           text        check (match_method in ('suggested_top', 'suggested_alternative', 'manual_search')),
  confirmed_by           uuid        references auth.users(id) on delete set null,
  confirmed_at           timestamptz,
  review_notes           text,

  -- Pixian clean-up. One cleaned result per photo, reused if the match changes.
  cleaned_path           text,
  cleaned_sha256         text,
  pixian_calls           integer     not null default 0,
  cleaning_started_at    timestamptz,
  cleaned_at             timestamptz,

  -- Publishing.
  published_pin_image_id uuid        references pin_images(id) on delete set null,
  published_image_url    text,
  replaced_image_url     text,
  published_by           uuid        references auth.users(id) on delete set null,
  published_at           timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (batch_id, original_sha256)
);

create index if not exists bulk_image_items_batch_status_idx on bulk_image_items (batch_id, status, created_at);
create index if not exists bulk_image_items_matched_at_idx on bulk_image_items (matched_at) where matched_at is not null;

-- updated_at maintenance (same function as the rest of the schema, 001).
drop trigger if exists bulk_image_batches_updated_at on bulk_image_batches;
create trigger bulk_image_batches_updated_at before update on bulk_image_batches
  for each row execute function set_updated_at();
drop trigger if exists bulk_image_items_updated_at on bulk_image_items;
create trigger bulk_image_items_updated_at before update on bulk_image_items
  for each row execute function set_updated_at();

-- ── RLS: admin read only; writes go through the API's service role ───────────

alter table bulk_image_batches enable row level security;
alter table bulk_image_items enable row level security;

drop policy if exists bulk_image_batches_admin_read on bulk_image_batches;
create policy bulk_image_batches_admin_read on bulk_image_batches for select using (is_admin());
drop policy if exists bulk_image_items_admin_read on bulk_image_items;
create policy bulk_image_items_admin_read on bulk_image_items for select using (is_admin());

-- ── Storage: private bulk-image-matcher bucket ───────────────────────────────
-- Paths: {batch_id}/{item_id}/original.jpg and .../cleaned.jpg. No storage
-- policies: only the service role reads or writes; admins see signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bulk-image-matcher', 'bulk-image-matcher', false, 15728640, array['image/jpeg'])
on conflict (id) do nothing;

-- ============================================================
-- End of migration 076.
-- ============================================================
