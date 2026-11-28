-- ============================================================
-- Rollback for migration 088 (coverage "newest" order) → back to 077.
--
-- Never applied by an agent. Run in the SQL editor of the project where 088
-- was applied (staging first). Restores 077's 9-argument
-- catalogue_coverage_page exactly (copied from 077) with 077's grants, and
-- removes 088's 10-argument version, in one transaction. Apps then fall back
-- to set order by themselves (the Home "New to the catalogue" strip hides).
-- ============================================================

begin;

drop function if exists public.catalogue_coverage_page(text[], text, text, integer, text, text, text, integer, integer, text);

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

revoke all on function public.catalogue_coverage_page(text[], text, text, integer, text, text, text, integer, integer) from public;
-- Supabase's default privileges give anon execute on new public functions; keep 088's tighter grant.
revoke all on function public.catalogue_coverage_page(text[], text, text, integer, text, text, text, integer, integer) from anon;
grant execute on function public.catalogue_coverage_page(text[], text, text, integer, text, text, text, integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ── Check ──
--   select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'catalogue_coverage_page';
--     -- one row, ending in "p_limit integer" (no p_sort)
--   select has_function_privilege('anon', 'public.catalogue_coverage_page(text[], text, text, integer, text, text, text, integer, integer)', 'execute');
--     -- false
