-- ============================================================
-- Catalogue V1 backup snapshot — run BEFORE the legacy reset.
--
-- Purely additive: CREATE SCHEMA + CREATE TABLE ... AS. Touches
-- nothing in the live `public` schema. Safe to run once and leave
-- in place indefinitely; drop the schema later only when confident
-- Catalogue V2 has fully superseded it.
--
-- This snapshot also serves as the frozen ID list that the Phase 3
-- reset statements select against (see supabase/migrations/037_catalogue_v2_provenance.sql
-- comments / the approved plan) — a future Catalogue V2 pin's UUID
-- can never appear in these tables, since they're created once, now,
-- before any V2 row exists.
--
-- Run in the Supabase SQL editor. Apply manually — do not automate.
-- ============================================================

create schema if not exists catalogue_v1_backup_2026_09_01;

create table catalogue_v1_backup_2026_09_01.pins                    as table public.pins;
create table catalogue_v1_backup_2026_09_01.pin_images               as table public.pin_images;
create table catalogue_v1_backup_2026_09_01.pin_sources               as table public.pin_sources;
create table catalogue_v1_backup_2026_09_01.pin_external_ids          as table public.pin_external_ids;
create table catalogue_v1_backup_2026_09_01.pin_characters            as table public.pin_characters;
create table catalogue_v1_backup_2026_09_01.characters                as table public.characters;
create table catalogue_v1_backup_2026_09_01.pin_categories            as table public.pin_categories;
create table catalogue_v1_backup_2026_09_01.pin_sets                  as table public.pin_sets;
create table catalogue_v1_backup_2026_09_01.pin_import_field_history  as table public.pin_import_field_history;
create table catalogue_v1_backup_2026_09_01.import_batches            as table public.import_batches;

-- ── Validation — run after the CREATE TABLEs above, paste results back ─────
select 'pins' as t, count(*) from catalogue_v1_backup_2026_09_01.pins
union all select 'pin_images', count(*) from catalogue_v1_backup_2026_09_01.pin_images
union all select 'pin_sources', count(*) from catalogue_v1_backup_2026_09_01.pin_sources
union all select 'pin_external_ids', count(*) from catalogue_v1_backup_2026_09_01.pin_external_ids
union all select 'pin_characters', count(*) from catalogue_v1_backup_2026_09_01.pin_characters
union all select 'characters', count(*) from catalogue_v1_backup_2026_09_01.characters
union all select 'pin_categories', count(*) from catalogue_v1_backup_2026_09_01.pin_categories
union all select 'pin_sets', count(*) from catalogue_v1_backup_2026_09_01.pin_sets
union all select 'pin_import_field_history', count(*) from catalogue_v1_backup_2026_09_01.pin_import_field_history
union all select 'import_batches', count(*) from catalogue_v1_backup_2026_09_01.import_batches;

-- Expected (live counts as of 2026-09-01, per the approved plan):
--   pins 13000, pin_images 300, pin_sources 1139, pin_external_ids 94,
--   pin_characters 13087, characters 820, pin_sets 18,
--   pin_import_field_history 0, import_batches 0
