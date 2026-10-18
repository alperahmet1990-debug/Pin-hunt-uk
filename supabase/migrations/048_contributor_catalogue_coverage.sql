-- ============================================================
-- Migration 048: Contributor browsing across the whole verified catalogue
--
-- Early Contributor Programme (#396). get_catalogue_image_coverage() (039)
-- only returned Collectible PinTrader pins and only photo status. Contributors
-- now browse every verified pin and filter by year, park/origin, character,
-- set and what's missing, so the function:
--
--   • drops the catalogue_source = 'collectible_pintrader' filter;
--   • keeps every other gate unchanged: can_access_feature(
--     'catalogue_contributions'), verified, searchable, not archived;
--   • keeps its existing columns, in the same order, first — current app
--     builds read them by name and keep working — and adds:
--       origin, main_character, all_characters, catalogue_source,
--       needs_back_image, missing_fields (text[]: 'release_year', 'set',
--       'characters', 'origin' where empty).
--
-- The return type changes, so the function is dropped and recreated (Postgres
-- can't CREATE OR REPLACE a different result shape). It runs in one
-- transaction, so callers never see it missing. Still SECURITY DEFINER for the
-- same reason as 039: contributors need counts of others' pending photos, and
-- only counts and the caller's own status are returned.
--
-- No table, column, row or policy changes. Run AFTER 047, in the Supabase SQL
-- editor: staging first, then supabase/verify/048_verify.sql. Rollback at the
-- bottom restores the 039 definition exactly.
-- ============================================================

begin;

drop function if exists get_catalogue_image_coverage();

create function get_catalogue_image_coverage()
returns table (
  pinhunt_id       text,
  title            text,
  set_name         text,
  release_year     integer,
  edition_type     text,
  image_url        text,
  image_source     text,
  pending_count    integer,
  my_status        text,
  origin           text,
  main_character   text,
  all_characters   text,
  catalogue_source text,
  needs_back_image boolean,
  missing_fields   text[]
)
language sql stable security definer
set search_path = public as $$
  select
    p.pinhunt_id,
    p.title,
    coalesce(nullif(p.normalised_series, ''), p.collection) as set_name,
    p.release_year,
    p.edition_type,
    p.image_url,
    case
      when exists (
        select 1 from pin_images ai
        where ai.pin_id = p.id and ai.uploaded_by is not null and ai.status = 'approved'
      ) then 'community'
      when p.image_url is not null then 'reference'
      else null
    end as image_source,
    (select count(*)::int from pin_images pi
      where pi.pin_id = p.id and pi.uploaded_by is not null and pi.status = 'pending') as pending_count,
    (select mi.status from pin_images mi
      where mi.pin_id = p.id and mi.uploaded_by = auth.uid()
      order by mi.created_at desc limit 1) as my_status,
    p.origin,
    p.main_character,
    p.all_characters,
    p.catalogue_source,
    coalesce(p.needs_back_image, false) as needs_back_image,
    array_remove(array[
      case when p.release_year is null then 'release_year' end,
      case when coalesce(nullif(p.normalised_series, ''), nullif(p.collection, '')) is null then 'set' end,
      case when coalesce(nullif(p.all_characters, ''), nullif(p.main_character, '')) is null then 'characters' end,
      case when nullif(p.origin, '') is null then 'origin' end
    ], null) as missing_fields
  from pins p
  where can_access_feature('catalogue_contributions')
    and p.verification_status = 'verified'
    and coalesce(p.is_searchable, true)
    and coalesce(p.catalogue_status, 'active') <> 'archived'
  order by set_name, p.title, p.pinhunt_id;
$$;

revoke all on function get_catalogue_image_coverage() from public;
grant execute on function get_catalogue_image_coverage() to authenticated;

commit;

-- ── Rollback (restores the 039 definition) ───────────────────────────────────
-- begin;
-- drop function if exists get_catalogue_image_coverage();
-- create or replace function get_catalogue_image_coverage()
-- returns table (
--   pinhunt_id     text,
--   title          text,
--   set_name       text,
--   release_year   integer,
--   edition_type   text,
--   image_url      text,
--   image_source   text,
--   pending_count  integer,
--   my_status      text
-- )
-- language sql stable security definer
-- set search_path = public as $$
--   select
--     p.pinhunt_id,
--     p.title,
--     coalesce(nullif(p.normalised_series, ''), p.collection) as set_name,
--     p.release_year,
--     p.edition_type,
--     p.image_url,
--     case
--       when exists (
--         select 1 from pin_images ai
--         where ai.pin_id = p.id and ai.uploaded_by is not null and ai.status = 'approved'
--       ) then 'community'
--       when p.image_url is not null then 'reference'
--       else null
--     end as image_source,
--     (select count(*)::int from pin_images pi
--       where pi.pin_id = p.id and pi.uploaded_by is not null and pi.status = 'pending') as pending_count,
--     (select mi.status from pin_images mi
--       where mi.pin_id = p.id and mi.uploaded_by = auth.uid()
--       order by mi.created_at desc limit 1) as my_status
--   from pins p
--   where can_access_feature('catalogue_contributions')
--     and p.catalogue_source = 'collectible_pintrader'
--     and p.verification_status = 'verified'
--     and coalesce(p.is_searchable, true)
--     and coalesce(p.catalogue_status, 'active') <> 'archived'
--   order by set_name, p.title, p.pinhunt_id;
-- $$;
-- grant execute on function get_catalogue_image_coverage() to authenticated;
-- commit;
-- ============================================================
-- End of migration 048.
-- ============================================================
