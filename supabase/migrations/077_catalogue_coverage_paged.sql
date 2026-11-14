-- ============================================================
-- Migration 077: contributor photo coverage, filtered and paged in the database
--
-- Why: get_catalogue_image_coverage() (048) returns every browsable pin with
-- its photo status, and the app pages through all of it (1,000 rows a call,
-- each call recomputing the whole result with three pin_images look-ups per
-- pin). That was fine at ~3k pins; with Pin & Pop (~116k) it's ~117 calls
-- that each sort 116k rows. It also showed pins_and_pop's internal series key
-- ("pin_and_pop | <slug>") as the set name, because it preferred
-- normalised_series over collection.
--
-- What (all additive; 048's function is left as it is for older app builds):
--   pinhunt_private.catalogue_coverage   view: one row per browsable pin with
--       its photo status. Contribution counts are aggregated once (pin_images
--       with uploaded_by set is small), not looked up per pin. Set name is
--       collection first. In a schema the API doesn't expose.
--   catalogue_coverage_page(...)         rows for given pins, or one filtered
--       page (search, photo filter, year/park/character/set), with the total.
--   catalogue_coverage_summary(...)      the screen's counts and one facet's
--       choices with counts, as JSON.
--   catalogue_coverage_set_totals(...)   pins and pins-with-photo per set.
-- Same gate as 048: can_access_feature('catalogue_contributions'); the service
-- role is also let through (it can read everything anyway), so the queries can
-- be timed without a contributor login.
--
-- STAGING RUN: the guard stops unless this is the staging project.
-- PRODUCTION RUN (later): swap the guard per artifacts/api-server/scripts/PINANDPOP.md.
-- ============================================================

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'pinhunt-staging-marker') then
    raise exception 'Not the staging project (no pinhunt-staging-marker bucket). Nothing was changed.';
  end if;
end $$;

create schema if not exists pinhunt_private;
revoke all on schema pinhunt_private from public, anon, authenticated;

-- ── The coverage view (same rows and meaning as 048, cheaper to compute) ─────
create or replace view pinhunt_private.catalogue_coverage as
select
  p.id as pin_uuid,
  p.pinhunt_id,
  p.title,
  coalesce(nullif(p.collection, ''), nullif(p.normalised_series, ''), 'Uncategorised') as set_name,
  p.release_year,
  p.edition_type,
  p.image_url,
  case
    when c.has_approved then 'community'
    when p.image_url is not null then 'reference'
  end as image_source,
  coalesce(c.pending_count, 0) as pending_count,
  m.status as my_status,
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
from public.pins p
left join (
  select pin_id,
         bool_or(status = 'approved') as has_approved,
         (count(*) filter (where status = 'pending'))::int as pending_count
  from public.pin_images
  where uploaded_by is not null
  group by pin_id
) c on c.pin_id = p.id
left join (
  select distinct on (pin_id) pin_id, status
  from public.pin_images
  where uploaded_by = auth.uid()
  order by pin_id, created_at desc
) m on m.pin_id = p.id
where p.verification_status = 'verified'
  and coalesce(p.is_searchable, true)
  and coalesce(p.catalogue_status, 'active') <> 'archived';

revoke all on pinhunt_private.catalogue_coverage from public, anon, authenticated;

-- ── Shared WHERE clause, built with literals so each call gets its own plan ──
create or replace function pinhunt_private.coverage_where(
  p_ids text[], p_query text, p_filter text,
  p_year integer, p_origin text, p_character text, p_set text
) returns text
language plpgsql immutable
set search_path = public, pg_temp
as $fn$
declare
  w text := 'true';
  q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if p_ids is not null then w := w || format(' and v.pinhunt_id = any(%L::text[])', p_ids); end if;
  if p_year is not null then w := w || format(' and v.release_year = %L', p_year); end if;
  if p_origin is not null then w := w || format(' and v.origin = %L', p_origin); end if;
  if p_set is not null then w := w || format(' and v.set_name = %L', p_set); end if;
  if p_character is not null then
    w := w || format(
      ' and (v.main_character = %1$L or %1$L = any(array(select trim(x) from unnest(string_to_array(v.all_characters, %2$L)) x)))',
      p_character, ',');
  end if;
  if q is not null then
    -- A PHUK id, or the same word search as the catalogue (search_catalogue_pins, 076).
    w := w || format(
      ' and (v.pinhunt_id ilike %L or v.pin_uuid in (select s.id from public.search_catalogue_pins(%L::text[]) s))',
      replace(replace(q, '%', '\%'), '_', '\_') || '%',
      regexp_split_to_array(trim(regexp_replace(q, '[,().]', ' ', 'g')), '\s+'));
  end if;
  w := w || case coalesce(p_filter, 'all')
    when 'needs'     then ' and v.image_source is null and v.pending_count = 0 and v.my_status is distinct from ''pending'''
    when 'reference' then ' and v.image_source = ''reference'''
    when 'community' then ' and v.image_source = ''community'''
    when 'pending'   then ' and (v.pending_count > 0 or v.my_status = ''pending'')'
    when 'info'      then ' and cardinality(v.missing_fields) > 0'
    when 'back'      then ' and v.needs_back_image'
    else ''
  end;
  return w;
end
$fn$;

revoke all on function pinhunt_private.coverage_where(text[], text, text, integer, text, text, text) from public, anon, authenticated;

create or replace function pinhunt_private.coverage_allowed() returns boolean
language sql stable
set search_path = public, pg_temp
as $$ select coalesce(auth.role(), '') = 'service_role' or coalesce(public.can_access_feature('catalogue_contributions'), false) $$;

revoke all on function pinhunt_private.coverage_allowed() from public, anon, authenticated;

-- ── 1. Rows: given pins (p_ids) and/or one filtered page ─────────────────────
create or replace function public.catalogue_coverage_page(
  p_ids text[] default null,
  p_query text default null,
  p_filter text default 'all',
  p_year integer default null,
  p_origin text default null,
  p_character text default null,
  p_set text default null,
  p_offset integer default 0,
  p_limit integer default 240
)
returns table (
  pinhunt_id text, title text, set_name text, release_year integer, edition_type text,
  image_url text, image_source text, pending_count integer, my_status text, origin text,
  main_character text, all_characters text, catalogue_source text, needs_back_image boolean,
  missing_fields text[], total bigint
)
language plpgsql stable security definer
set search_path = public, pinhunt_private, extensions, pg_temp
as $fn$
begin
  if not pinhunt_private.coverage_allowed() then return; end if;
  return query execute
    'select v.pinhunt_id, v.title, v.set_name, v.release_year, v.edition_type, v.image_url, v.image_source,'
    ' v.pending_count, v.my_status, v.origin, v.main_character, v.all_characters, v.catalogue_source,'
    ' v.needs_back_image, v.missing_fields, count(*) over ()'
    ' from pinhunt_private.catalogue_coverage v where '
    || pinhunt_private.coverage_where(p_ids, p_query, p_filter, p_year, p_origin, p_character, p_set)
    || format(' order by v.set_name, v.title, v.pinhunt_id offset %s limit %s',
              greatest(coalesce(p_offset, 0), 0), least(greatest(coalesce(p_limit, 240), 1), 1000));
end
$fn$;

-- ── 2. Counts for the header chips, and one facet's choices ──────────────────
-- Counts use the year/park/character/set facets only (as the screen always
-- has). p_owned: the caller's owned pinhunt_ids, for the "mine" count.
-- p_facet: 'year' | 'origin' | 'character' | 'set' to also return that
-- facet's values with counts, ignoring that facet's own filter.
create or replace function public.catalogue_coverage_summary(
  p_year integer default null,
  p_origin text default null,
  p_character text default null,
  p_set text default null,
  p_owned text[] default null,
  p_facet text default null
)
returns jsonb
language plpgsql stable security definer
set search_path = public, pinhunt_private, extensions, pg_temp
as $fn$
declare
  v_stats jsonb;
  v_facet jsonb := null;
  v_where text;
begin
  if not pinhunt_private.coverage_allowed() then return null; end if;

  execute
    'select jsonb_build_object('
    ' ''total'', count(*),'
    ' ''withPhoto'', count(*) filter (where v.image_source is not null),'
    ' ''community'', count(*) filter (where v.image_source = ''community''),'
    ' ''reference'', count(*) filter (where v.image_source = ''reference''),'
    ' ''needs'', count(*) filter (where v.image_source is null and v.pending_count = 0 and v.my_status is distinct from ''pending''),'
    ' ''pending'', count(*) filter (where v.pending_count > 0 or v.my_status = ''pending''),'
    ' ''mine'', count(*) filter (where v.pinhunt_id = any($1)),'
    ' ''info'', count(*) filter (where cardinality(v.missing_fields) > 0),'
    ' ''back'', count(*) filter (where v.needs_back_image))'
    ' from pinhunt_private.catalogue_coverage v where '
    || pinhunt_private.coverage_where(null, null, 'all', p_year, p_origin, p_character, p_set)
    into v_stats using coalesce(p_owned, '{}'::text[]);

  if p_facet in ('year', 'origin', 'character', 'set') then
    v_where := pinhunt_private.coverage_where(null, null, 'all',
      case when p_facet = 'year' then null else p_year end,
      case when p_facet = 'origin' then null else p_origin end,
      case when p_facet = 'character' then null else p_character end,
      case when p_facet = 'set' then null else p_set end);
    execute format(
      'select coalesce(jsonb_agg(jsonb_build_object(''value'', value, ''count'', n) order by %s), ''[]''::jsonb)'
      ' from (select value, count(*) as n from (select %s as value from pinhunt_private.catalogue_coverage v where %s) x'
      ' where value is not null and value <> '''' group by value) y',
      case when p_facet = 'year' then 'value::int desc' else 'value' end,
      case p_facet
        when 'year' then 'v.release_year::text'
        when 'origin' then 'trim(v.origin)'
        when 'set' then 'v.set_name'
        else 'unnest(array(select distinct trim(c) from unnest(string_to_array(coalesce(v.all_characters, '''') || '','' || coalesce(v.main_character, ''''), '','')) c))'
      end,
      v_where)
      into v_facet;
  end if;

  return jsonb_build_object('stats', v_stats, 'facet', v_facet);
end
$fn$;

-- ── 3. Per-set totals for set headers (whole set, ignoring filters) ──────────
create or replace function public.catalogue_coverage_set_totals(p_sets text[])
returns table (set_name text, total integer, with_photo integer)
language plpgsql stable security definer
set search_path = public, pinhunt_private, extensions, pg_temp
as $fn$
begin
  if not pinhunt_private.coverage_allowed() or p_sets is null then return; end if;
  return query execute format(
    'select v.set_name, count(*)::int, (count(*) filter (where v.image_source is not null))::int'
    ' from pinhunt_private.catalogue_coverage v where v.set_name = any(%L::text[]) group by v.set_name', p_sets);
end
$fn$;

revoke all on function public.catalogue_coverage_page(text[], text, text, integer, text, text, text, integer, integer) from public;
revoke all on function public.catalogue_coverage_summary(integer, text, text, text, text[], text) from public;
revoke all on function public.catalogue_coverage_set_totals(text[]) from public;
grant execute on function public.catalogue_coverage_page(text[], text, text, integer, text, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.catalogue_coverage_summary(integer, text, text, text, text[], text) to authenticated, service_role;
grant execute on function public.catalogue_coverage_set_totals(text[]) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Verification (SQL editor runs as postgres, which isn't a contributor: use the app or the service key) ──
--   select count(*) from pg_proc where proname in ('catalogue_coverage_page', 'catalogue_coverage_summary', 'catalogue_coverage_set_totals'); -- 3
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
--   drop function if exists public.catalogue_coverage_page(text[], text, text, integer, text, text, text, integer, integer);
--   drop function if exists public.catalogue_coverage_summary(integer, text, text, text, text[], text);
--   drop function if exists public.catalogue_coverage_set_totals(text[]);
--   drop schema if exists pinhunt_private cascade;
--   notify pgrst, 'reload schema';
--   (the app falls back to get_catalogue_image_coverage, 048)
-- ============================================================
-- End of migration 077.
-- ============================================================
