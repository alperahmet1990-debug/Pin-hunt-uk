-- ============================================================
-- Migration 037: Catalogue V2 provenance scaffolding
--
-- Purely additive — no existing table, column, or policy is dropped
-- or altered destructively. Two existing policies are *tightened*
-- (pin_sets_public_read) in an additive, backwards-safe way (narrower
-- USING clause, same admin bypass via pin_sets_admin_write).
--
-- Prerequisite: run supabase/backup_catalogue_v1_2026-09-01.sql FIRST
-- and confirm the row counts, before running this file.
--
-- This migration does NOT touch pins.catalogue_status/is_searchable
-- or pin_sets.is_legacy_v1 values for any existing row — every new
-- boolean column here defaults to false, meaning existing rows are
-- classified "not legacy" until the separate, explicitly-approved
-- Phase 3 reset statement runs. Do not skip that step or the V1
-- catalogue will still be live/searchable after this migration.
--
-- Run AFTER 001–036, in the Supabase SQL editor. Safe to run more
-- than once (IF NOT EXISTS / IF EXISTS guards throughout).
-- ============================================================

-- ── Rights/provenance source registry ──────────────────────────────────────
-- One row per external data provider (Collectible PinTrader today; Pin & Pop,
-- PinTradingDB, PinPics, etc. as future rows) — makes attribution and rights
-- gating source-driven instead of hardcoded per your instruction.

create table if not exists catalogue_sources (
  id text primary key,
  display_name text not null,
  attribution_text text,
  rights_basis text,
  exact_license_variant text,
  public_display_allowed boolean not null default false,
  storage_allowed boolean not null default false,
  app_use_allowed boolean not null default false,
  attribution_required boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into catalogue_sources (
  id, display_name, attribution_text, rights_basis, exact_license_variant,
  public_display_allowed, storage_allowed, app_use_allowed, attribution_required, notes
) values (
  'collectible_pintrader',
  'Collectible PinTrader',
  'Pin data/image provided by Collectible PinTrader',
  'Public Creative Commons export + explicit permission from Collectible PinTrader developer',
  'pending confirmation',
  true, true, true, true,
  'See .agents/memory/collectible-pintrader-rights.md for the full evidence record.'
) on conflict (id) do nothing;

alter table catalogue_sources enable row level security;

drop policy if exists catalogue_sources_public_read on catalogue_sources;
create policy catalogue_sources_public_read on catalogue_sources
  for select using (true);  -- needed for attribution display; matches characters/categories precedent

drop policy if exists catalogue_sources_admin_insert on catalogue_sources;
create policy catalogue_sources_admin_insert on catalogue_sources
  for insert with check (is_admin());

drop policy if exists catalogue_sources_admin_update on catalogue_sources;
create policy catalogue_sources_admin_update on catalogue_sources
  for update using (is_admin()) with check (is_admin());
-- No public/authenticated write policy — matches the characters/categories
-- admin-write pattern from 009_admin_catalogue_rls.sql. The importer uses
-- the service-role key, which bypasses RLS entirely, same as every other
-- import script in this repo.

-- ── pin_images: per-image provenance + per-pin dedup ────────────────────────

alter table pin_images
  add column if not exists source text references catalogue_sources(id),
  add column if not exists source_record_id text,
  add column if not exists content_hash text,
  add column if not exists public_display_allowed boolean not null default false,
  add column if not exists attribution_required boolean not null default true;

create unique index if not exists pin_images_pin_source_hash_idx
  on pin_images (pin_id, source, content_hash) where content_hash is not null;
-- Per-pin, not global: a duplicate image may legitimately be associated with
-- more than one pin. This index only prevents the SAME pin from getting the
-- same image associated twice on a re-run of the importer.

-- ── pin_external_ids: prevent two pins claiming the same external id ───────
-- Duplicate check (run 2026-09-01, read-only, against live data): 94 rows,
-- 94 distinct (source, external_id) pairs, 0 duplicates. Safe to create.

create unique index if not exists pin_external_ids_source_external_unique
  on pin_external_ids (source, external_id);

-- ── Multi-set membership (CTP groups can be many-to-many) ──────────────────
-- The existing one-set-per-pin text-match model (pins.collection) can't
-- represent a pin belonging to multiple groups. This join table can, without
-- touching pins.collection or any code that reads it as the primary set.

create table if not exists pin_set_memberships (
  pin_id uuid not null references pins(id) on delete cascade,
  set_id uuid not null references pin_sets(id) on delete cascade,
  primary key (pin_id, set_id)
);

alter table pin_set_memberships enable row level security;

-- Readable wherever the underlying pin is readable — mirrors pins_public_read
-- exactly (verified+searchable, or the caller owns the pin), not the looser
-- `USING (true)` used by pin_characters/pin_categories.
drop policy if exists pin_set_memberships_public_read on pin_set_memberships;
create policy pin_set_memberships_public_read on pin_set_memberships
  for select using (
    exists (
      select 1 from pins p
      where p.id = pin_set_memberships.pin_id
        and (
          (p.verification_status = 'verified' and p.is_searchable)
          or exists (
            select 1 from user_pins up
            where up.pin_id = p.id and up.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists pin_set_memberships_admin_all on pin_set_memberships;
create policy pin_set_memberships_admin_all on pin_set_memberships
  for all using (is_admin()) with check (is_admin());
-- Import writes go through the service-role key (bypasses RLS), same as
-- every other importer script in this repo.

-- ── pins: legacy flag + import-batch integrity ──────────────────────────────
-- Orphan check (run 2026-09-01, read-only): import_batches has 0 rows and 0
-- of the 13,000 pins have a non-null import_batch_id — nothing to violate.

alter table pins add column if not exists is_legacy_v1 boolean not null default false;

alter table pins drop constraint if exists pins_import_batch_id_fkey;
alter table pins add constraint pins_import_batch_id_fkey
  foreign key (import_batch_id) references import_batches(id);

-- ── pin_sets: legacy flag + provenance, tightened public read ──────────────

alter table pin_sets
  add column if not exists is_legacy_v1 boolean not null default false,
  add column if not exists catalogue_source text references catalogue_sources(id),
  add column if not exists source_record_id text,      -- e.g. the raw CTP group string's stable key
  add column if not exists original_source_name text;   -- raw, unnormalised source label for provenance display

drop policy if exists pin_sets_public_read on pin_sets;
create policy pin_sets_public_read on pin_sets
  for select using (is_legacy_v1 = false);
-- pin_sets_admin_write already grants admins FOR ALL (includes SELECT), so
-- admin visibility into legacy sets for backup/audit purposes is unaffected.

-- ============================================================
-- End of migration 037. This does NOT run the Phase 3 legacy reset —
-- that is a separate, explicitly-approved statement (see the approved
-- plan, section E) run only after this migration and the backup are
-- both confirmed.
-- ============================================================
