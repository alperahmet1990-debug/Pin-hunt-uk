-- ============================================================
-- Migration 062: profile data access by role (B-P0-01, #10)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/062_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate approval. Rollback at the bottom.
-- Needs only the profiles table, so it does not depend on 057 to 061.
--
-- RELEASE ORDER: publish the matching app update FIRST. Older app builds read
-- and save postcode directly, which this file refuses. The update works both
-- before and after this migration.
--
--   1. Signed-out clients have no access to profiles or public_profiles.
--   2. Signed-in clients read profile columns from an explicit list. Postcode
--      and coordinates are not on it. New columns stay private until granted.
--   3. get_my_postcode() returns a collector's own postcode. Coordinates stay
--      server-side.
-- ============================================================

begin;

revoke all on public.profiles from anon;
revoke all on public.public_profiles from anon;
drop policy if exists "Public profiles are visible to all" on public.profiles;

-- Replaces table-wide SELECT. A column revoke has no effect alongside it.
revoke select on public.profiles from authenticated;

do $$
declare v_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('postcode', 'approx_lat', 'approx_lng');
  execute format('grant select (%s) on public.profiles to authenticated', v_columns);
end $$;

create or replace function public.get_my_postcode()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select postcode from profiles where id = auth.uid();
$$;

revoke all on function public.get_my_postcode() from public, anon;
grant execute on function public.get_my_postcode() to authenticated;

commit;

-- ============================================================
-- Verification: supabase/verify/062_verify.sql (rolls itself back).
--
-- ROLLBACK. This restores wider access, so only use it to recover the app.
-- begin;
-- drop function if exists public.get_my_postcode();
-- grant select on public.profiles to authenticated, anon;
-- grant select on public.public_profiles to anon;
-- create policy "Public profiles are visible to all" on public.profiles
--   for select using (profile_visibility = 'public' and username is not null);
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
