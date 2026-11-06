-- ============================================================
-- Migration 062: profile data access by role (B-P0-01, #10)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/062_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate approval. Rollback at the bottom.
-- Needs only the profiles table, so it does not depend on 057 to 061.
--
-- RELEASE ORDER: every client ships first. See 062_RUNBOOK.md.
--
--   1. public_profiles and profiles are for signed-in clients only.
--   2. Signed-in clients read and write profiles through explicit column
--      lists. A new column stays private until it is added to a list.
--   3. get_my_postcode() returns a collector's own postcode.
-- ============================================================

begin;

revoke all on public.profiles from anon;
revoke all on public.public_profiles from anon;
drop policy if exists "Public profiles are visible to all" on public.profiles;

revoke select, insert, update on public.profiles from authenticated;

grant select (
  id, username, display_name, avatar_url, bio, location,
  is_admin, is_app_creator,
  created_at, updated_at,
  trading_region, international_trading_enabled,
  allow_trade_requests, allow_messages, profile_visibility,
  town, county, country,
  nearby_discovery_enabled, preferred_radius_miles,
  open_to_local_trades, open_to_postal_trades, happy_to_travel,
  has_location_set
) on public.profiles to authenticated;

grant insert (
  id, updated_at,
  username, display_name, avatar_url, bio, location,
  trading_region, international_trading_enabled,
  allow_trade_requests, allow_messages, profile_visibility,
  town, county, country,
  nearby_discovery_enabled, preferred_radius_miles,
  open_to_local_trades, open_to_postal_trades, happy_to_travel
) on public.profiles to authenticated;

grant update (
  updated_at,
  username, display_name, avatar_url, bio, location,
  trading_region, international_trading_enabled,
  allow_trade_requests, allow_messages, profile_visibility,
  town, county, country,
  nearby_discovery_enabled, preferred_radius_miles,
  open_to_local_trades, open_to_postal_trades, happy_to_travel
) on public.profiles to authenticated;

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
-- RECOVERY if an older app build can't load profiles. Try this first, briefly:
--   grant select (postcode) on public.profiles to authenticated;
--   notify pgrst, 'reload schema';
--
-- FULL ROLLBACK. This restores the earlier access, so it's a last resort.
-- begin;
-- drop function if exists public.get_my_postcode();
-- grant select, insert, update on public.profiles to authenticated;
-- grant select on public.profiles to anon;
-- grant select on public.public_profiles to anon;
-- drop policy if exists "Public profiles are visible to all" on public.profiles;
-- create policy "Public profiles are visible to all" on public.profiles
--   for select using (profile_visibility = 'public' and username is not null);
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
