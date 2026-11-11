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
--   pins_public_read   verified and searchable, or a pin the caller owns
--   pins_admin_read_all  is_admin()
--   service role       everything (it bypasses RLS on the table too)
-- It returns pins rows, so the app keeps every other filter, the ordering,
-- paging, counts and embeds on top of it (lib/pin-repository buildSearchQuery).
-- If this function is missing, the app falls back to the old table query.
--
-- Purely additive: one function and its grants. No table, row or policy
-- changes. Needs 075 (the indexes) to be fast, not to be correct.
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
--           % and _ in a word are escaped.
-- p_character: optional character filter (all_characters, main_character, or
--           the pin_characters junction), same as the app's character filter.
create or replace function public.search_catalogue_pins(p_tokens text[] default '{}', p_character text default null)
returns setof public.pins
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with words as (
    select array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') order by length(w) desc) as w
    from unnest(coalesce(p_tokens, '{}')) as w
    where length(trim(w)) > 0
  ),
  ch as (
    select nullif(trim(replace(replace(replace(coalesce(p_character, ''), '\', '\\'), '%', '\%'), '_', '\_')), '') as c
  )
  select p.*
  from public.pins p, words, ch
  where
    -- visibility: mirrors RLS on pins
    (
      coalesce(auth.role(), '') = 'service_role'
      or public.is_admin()
      or (p.verification_status = 'verified' and p.is_searchable = true)
      or exists (select 1 from public.user_pins up where up.pin_id = p.id and up.user_id = auth.uid())
    )
    -- the longest word: a plain OR over indexed columns, so Postgres can use the trigram indexes
    and (
      words.w is null
      or p.title ilike '%' || words.w[1] || '%'
      or p.brand ilike '%' || words.w[1] || '%'
      or p.collection ilike '%' || words.w[1] || '%'
      or p.main_character ilike '%' || words.w[1] || '%'
      or p.all_characters ilike '%' || words.w[1] || '%'
      or p.search_aliases ilike '%' || words.w[1] || '%'
      or p.normalised_series ilike '%' || words.w[1] || '%'
      or p.main_subject ilike '%' || words.w[1] || '%'
      or p.release_scope ilike '%' || words.w[1] || '%'
    )
    -- every other word must match some field too
    and not exists (
      select 1 from unnest(coalesce(words.w[2:], '{}')) t
      where not (
        p.title ilike '%' || t || '%' or p.brand ilike '%' || t || '%' or p.collection ilike '%' || t || '%'
        or p.main_character ilike '%' || t || '%' or p.all_characters ilike '%' || t || '%'
        or p.search_aliases ilike '%' || t || '%' or p.normalised_series ilike '%' || t || '%'
        or p.main_subject ilike '%' || t || '%' or p.release_scope ilike '%' || t || '%'
      )
    )
    and (
      ch.c is null
      or p.id in (
        select id from public.pins where all_characters ilike '%' || ch.c || '%'
        union
        select id from public.pins where main_character ilike '%' || ch.c || '%'
        union
        select pc.pin_id from public.pin_characters pc
          join public.characters c on c.id = pc.character_id
         where c.name ilike '%' || ch.c || '%'
      )
    )
$$;

revoke all on function public.search_catalogue_pins(text[], text) from public;
grant execute on function public.search_catalogue_pins(text[], text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Verification ──────────────────────────────────────────────────────────────
--   select count(*) from search_catalogue_pins(array['stitch']);            -- > 0, well under a second
--   select count(*) from search_catalogue_pins(array['zzzzqx']);            -- 0, a few ms
--   select count(*) from search_catalogue_pins(array['haunted','mansion']); -- both words must match
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
--   drop function if exists public.search_catalogue_pins(text[], text);
--   notify pgrst, 'reload schema';
--   (the app falls back to the old table query automatically)
-- ============================================================
-- End of migration 076.
-- ============================================================
