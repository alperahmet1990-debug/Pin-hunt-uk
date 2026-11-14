-- ============================================================
-- Migration 076: fast catalogue search for collectors
--
-- Why: catalogue search is `ilike '%term%'` over nine text columns. 075 added
-- trigram indexes, but with RLS on `pins` Postgres can't use them for
-- collectors: `ilike` isn't leakproof, so the pins_public_read policy has to be
-- checked on every row first. That costs ~1.3 s a search on the Pin & Pop
-- catalogue (116k pins), against ~0.1 s with the indexes.
--
-- What: search_catalogue_pins() does only the text/character matching, as the
-- owner (so the indexes are used), and applies the SAME visibility rule as RLS
-- explicitly:
--   pins_public_read     verified and searchable, or a pin the caller owns
--   pins_admin_read_all  is_admin()
--   service role         everything (it bypasses RLS on the table too)
-- It returns pins rows, so the app keeps every other filter, the ordering,
-- paging, counts and embeds on top of it (lib/pin-repository buildSearchQuery).
-- If this function is missing, the app falls back to the old table query.
--
-- plpgsql with a built query, on purpose: who-can-see-what is worked out once
-- per call (not per row), and each word goes in as a literal pattern, so the
-- planner uses the trigram indexes. (A first SQL-language version called
-- is_admin() per row and hid the patterns behind a CTE: every search timed out.)
--
-- Purely additive: one function and its grants. No table, row or policy
-- changes. Safe to re-run (create or replace). Needs 075 for speed.
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

-- p_tokens: search words; every word must match at least one of the nine
--           fields (same rule as the app's old query). Matched literally:
--           \ % and _ in a word are escaped.
-- p_character: optional character filter (all_characters, main_character, or
--           the pin_characters junction), same as the app's character filter.
create or replace function public.search_catalogue_pins(p_tokens text[] default '{}', p_character text default null)
returns setof public.pins
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_cols constant text[] := array['title', 'brand', 'collection', 'main_character', 'all_characters',
                                  'search_aliases', 'normalised_series', 'main_subject', 'release_scope'];
  v_uid uuid := auth.uid();
  v_see_all boolean := coalesce(auth.role(), '') = 'service_role' or coalesce(public.is_admin(), false);
  v_sql text := 'select p.* from public.pins p where true';
  v_word text;
  v_pattern text;
  v_char text := nullif(trim(coalesce(p_character, '')), '');
begin
  -- Visibility (mirrors RLS on pins), decided once for this caller.
  if not v_see_all then
    if v_uid is null then
      v_sql := v_sql || ' and p.verification_status = ''verified'' and p.is_searchable = true';
    else
      v_sql := v_sql || format(
        ' and ((p.verification_status = ''verified'' and p.is_searchable = true)'
        ' or exists (select 1 from public.user_pins up where up.pin_id = p.id and up.user_id = %L::uuid))', v_uid);
    end if;
  end if;

  -- Every word must match one of the nine fields.
  for v_word in
    select w from unnest(coalesce(p_tokens, '{}')) as w where length(trim(w)) > 0
  loop
    v_pattern := '%' || replace(replace(replace(trim(v_word), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_sql := v_sql || ' and (' ||
      (select string_agg(format('p.%I ilike %L', c, v_pattern), ' or ') from unnest(v_cols) as c) || ')';
  end loop;

  if v_char is not null then
    v_pattern := '%' || replace(replace(replace(v_char, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_sql := v_sql || format(
      ' and p.id in (select id from public.pins where all_characters ilike %1$L'
      ' union select id from public.pins where main_character ilike %1$L'
      ' union select pc.pin_id from public.pin_characters pc join public.characters c on c.id = pc.character_id'
      ' where c.name ilike %1$L)', v_pattern);
  end if;

  return query execute v_sql;
end
$fn$;

revoke all on function public.search_catalogue_pins(text[], text) from public;
grant execute on function public.search_catalogue_pins(text[], text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Verification ──────────────────────────────────────────────────────────────
--   select count(*) from search_catalogue_pins(array['stitch']);            -- 4767 on staging (11 Nov 2026)
--   select count(*) from search_catalogue_pins(array['zzzzqx']);            -- 0
--   select count(*) from search_catalogue_pins(array['haunted','mansion']); -- both words must match
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
--   drop function if exists public.search_catalogue_pins(text[], text);
--   notify pgrst, 'reload schema';
--   (the app falls back to the old table query automatically)
-- ============================================================
-- End of migration 076.
-- ============================================================
