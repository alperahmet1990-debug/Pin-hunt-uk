-- ============================================================
-- Migration 078: Bulk board scanning (staging first)
--
-- Photographs of pin trading boards, split into one row per detected pin,
-- matched to the catalogue and (optionally) cleaned up into catalogue
-- photo candidates. Step A is the admin catalogue-capture workflow
-- (routes/board-scans.ts); Step B (collector board scanning) will reuse
-- these tables with mode = 'collector'.
--
-- Rights: every board records where the photo came from and what its
-- owner allowed — processing (cropping, clean-up) and, separately, public
-- display. The API refuses to publish a crop from a board without public
-- display permission. Pin & Pop images are never stored here.
--
-- Purely additive: two new tables, one private storage bucket, one
-- catalogue_sources row. No existing table, column or policy changes.
-- Writes go through the API server's service-role key; RLS below only
-- opens reads to admins.
--
-- Apply in the STAGING Supabase SQL editor first. Run AFTER 077 (Pin & Pop: 075–077).
--
-- Rollback (safe — nothing else references these):
--   drop table if exists board_scan_items;
--   drop table if exists board_scans;
--   delete from storage.objects where bucket_id = 'board-scans';
--   delete from storage.buckets where id = 'board-scans';
--   -- only if no pin_images row uses it:
--   delete from catalogue_sources where id = 'pinhunt_board_scan';
-- ============================================================

-- ── Source for published board-scan photos ───────────────────────────────────
-- pin_images rows created by board-scan approvals carry
--   source = 'pinhunt_board_scan', source_record_id = board_scan_items.id
-- so the board (and its permission record) can always be traced.

insert into catalogue_sources (
  id, display_name, attribution_text, rights_basis, exact_license_variant,
  public_display_allowed, storage_allowed, app_use_allowed, attribution_required, notes
) values (
  'pinhunt_board_scan',
  'PinHunt board photos',
  'Photo: PinHunt community',
  'Photographed by PinHunt or contributed by collectors with explicit permission, recorded per board in board_scans',
  null,
  true, true, true, false,
  'Per-board permission lives on board_scans (permission_public_display etc.). Only boards with public display permission can be published.'
) on conflict (id) do nothing;

-- ── board_scans: one uploaded board photo ────────────────────────────────────

create table if not exists board_scans (
  id                          uuid        primary key default gen_random_uuid(),
  created_by                  uuid        not null references auth.users(id) on delete cascade,
  mode                        text        not null default 'catalogue_capture'
                                check (mode in ('catalogue_capture', 'collector')),
  status                      text        not null default 'queued'
                                check (status in ('queued', 'detecting', 'matching', 'cleaning',
                                                  'ready', 'partial', 'failed')),
  title                       text,
  -- Private board-scans bucket. EXIF (incl. GPS) is stripped on upload.
  image_path                  text        not null,
  image_sha256                text        not null,
  image_width                 integer     not null,
  image_height                integer     not null,

  -- Provenance and permission
  permission_basis            text        not null
                                check (permission_basis in ('own_photo', 'contributor_permission')),
  contributor_name            text,
  contributor_handle          text,
  permission_evidence         text,
  permission_processing       boolean     not null default false,
  permission_public_display   boolean     not null default false,
  not_third_party_catalogue   boolean     not null default false,
  permission_recorded_at      timestamptz not null default now(),

  detection_truncated         boolean     not null default false,
  stats                       jsonb       not null default '{}'::jsonb,
  error                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Nothing is processed without permission to crop and clean it up, and a
  -- contributed board must say who gave permission and where the evidence is.
  constraint board_scans_processing_permitted check (permission_processing),
  constraint board_scans_not_catalogue_images check (not_third_party_catalogue),
  constraint board_scans_contributor_recorded check (
    permission_basis = 'own_photo'
    or (contributor_name is not null and permission_evidence is not null)
  )
);

create index if not exists board_scans_created_by_idx on board_scans (created_by, created_at desc);
create index if not exists board_scans_sha_idx on board_scans (created_by, image_sha256);

create trigger board_scans_updated_at
  before update on board_scans
  for each row execute function set_updated_at();

-- ── board_scan_items: one detected (or manually added) pin ───────────────────

create table if not exists board_scan_items (
  id                uuid        primary key default gen_random_uuid(),
  board_scan_id     uuid        not null references board_scans(id) on delete cascade,
  position          integer     not null,
  origin            text        not null default 'detected' check (origin in ('detected', 'manual')),
  -- {x, y, w, h} as fractions (0–1) of the board photo
  box               jsonb       not null,
  crop_path         text,
  crop_sha256       text,
  crop_dhash        text,
  quality           jsonb,
  detection         jsonb,

  match_status      text        not null default 'pending'
                      check (match_status in ('pending', 'suggested', 'unmatched', 'failed')),
  candidates        jsonb       not null default '[]'::jsonb,
  suggested_pin_id  text,       -- pins.pinhunt_id
  match_confidence  integer,
  pin_has_image     boolean,

  decision          text        not null default 'undecided'
                      check (decision in ('undecided', 'confirmed', 'corrected', 'excluded')),
  decided_pin_id    text,       -- pins.pinhunt_id chosen by the reviewer
  exclude_reason    text        check (exclude_reason in ('not_a_pin', 'duplicate', 'not_wanted')),
  priority          integer     not null default 0,

  cleanup_status    text        not null default 'none'
                      check (cleanup_status in ('none', 'skipped', 'done', 'failed')),
  cleanup_note      text,
  cleaned_path      text,       -- pin-contributed-images bucket
  image_review      text        not null default 'none' check (image_review in ('none', 'approved', 'rejected')),
  pin_image_id      uuid        references pin_images(id) on delete set null,

  attempts          integer     not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (board_scan_id, position)
);

create index if not exists board_scan_items_scan_idx on board_scan_items (board_scan_id, position);
create index if not exists board_scan_items_crop_sha_idx on board_scan_items (crop_sha256);

create trigger board_scan_items_updated_at
  before update on board_scan_items
  for each row execute function set_updated_at();

-- ── RLS: admin read; all writes via the API server's service-role key ────────

alter table board_scans enable row level security;
alter table board_scan_items enable row level security;

drop policy if exists board_scans_admin_read on board_scans;
create policy board_scans_admin_read on board_scans
  for select using (is_admin());

drop policy if exists board_scan_items_admin_read on board_scan_items;
create policy board_scan_items_admin_read on board_scan_items
  for select using (is_admin());

-- ── Storage: private bucket for board photos and crops ───────────────────────
-- Path convention: {board_scan_id}/board.jpg, {board_scan_id}/crops/{item}.jpg.
-- No storage policies: only the service-role key (API server) reads or
-- writes, and the admin app gets short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-scans', 'board-scans', false, 20971520, array['image/jpeg'])
on conflict (id) do nothing;

-- ── Verification ──────────────────────────────────────────────────────────────
--   select count(*) from board_scans;                 -- 0
--   select id, public from storage.buckets where id = 'board-scans';   -- false
--   select id from catalogue_sources where id = 'pinhunt_board_scan';
-- ============================================================
-- End of migration 078.
-- ============================================================
