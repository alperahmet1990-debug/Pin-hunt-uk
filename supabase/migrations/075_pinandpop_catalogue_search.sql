-- ============================================================
-- Migration 075: catalogue search indexes for the Pin & Pop catalogue
--
-- With ~116k pins, catalogue search (searchPins / searchPinsPage: an OR of
-- `ilike '%term%'` over nine text columns) does a full scan and takes
-- ~1.5 s per query. Trigram GIN indexes on every searched column let
-- Postgres answer the OR with a bitmap index scan instead.
-- Postgres only uses them if EVERY column in the OR is indexed, so all
-- nine are listed. Also indexes pins.catalogue_source (sync and admin
-- counts filter on it).
--
-- Purely additive: no table, column, row or policy changes. RLS is
-- untouched. Takes under a minute on staging.
--
-- STAGING RUN: the guard below stops unless this is the staging project
-- (it holds the private marker bucket only `staging-db restore` creates).
-- PRODUCTION RUN (later, per artifacts/api-server/scripts/PINANDPOP.md):
-- swap the guard for the production one in that runbook.
-- ============================================================

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'pinhunt-staging-marker') then
    raise exception 'Not the staging project (no pinhunt-staging-marker bucket). Nothing was changed.';
  end if;
end $$;

create extension if not exists pg_trgm with schema extensions;

create index if not exists pins_title_trgm_idx             on pins using gin (title extensions.gin_trgm_ops);
create index if not exists pins_brand_trgm_idx             on pins using gin (brand extensions.gin_trgm_ops);
create index if not exists pins_collection_trgm_idx        on pins using gin (collection extensions.gin_trgm_ops);
create index if not exists pins_main_character_trgm_idx    on pins using gin (main_character extensions.gin_trgm_ops);
create index if not exists pins_all_characters_trgm_idx    on pins using gin (all_characters extensions.gin_trgm_ops);
create index if not exists pins_search_aliases_trgm_idx    on pins using gin (search_aliases extensions.gin_trgm_ops);
create index if not exists pins_normalised_series_trgm_idx on pins using gin (normalised_series extensions.gin_trgm_ops);
create index if not exists pins_main_subject_trgm_idx      on pins using gin (main_subject extensions.gin_trgm_ops);
create index if not exists pins_release_scope_trgm_idx     on pins using gin (release_scope extensions.gin_trgm_ops);

create index if not exists pins_catalogue_source_idx on pins (catalogue_source);

analyze pins;

-- ── Verification ──────────────────────────────────────────────────────────────
--   select count(*) from pg_indexes where tablename = 'pins' and indexname like '%_trgm_idx';  -- 9
--   explain select id from pins where title ilike '%stitch%' or collection ilike '%stitch%';
--     -- expect "Bitmap Index Scan on pins_title_trgm_idx" (not "Seq Scan")
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
--   drop index if exists pins_title_trgm_idx, pins_brand_trgm_idx, pins_collection_trgm_idx,
--     pins_main_character_trgm_idx, pins_all_characters_trgm_idx, pins_search_aliases_trgm_idx,
--     pins_normalised_series_trgm_idx, pins_main_subject_trgm_idx, pins_release_scope_trgm_idx,
--     pins_catalogue_source_idx;
-- ============================================================
-- End of migration 075.
-- ============================================================
