-- ============================================================
-- Migration 063: profile column lists (B-P0-01, #10)
--
-- DRAFT, L3. Never applied by an agent. Apply straight after 062, in the same
-- sitting, and run supabase/verify/063_verify.sql, then:
--   notify pgrst, 'reload schema';
-- See 062_RUNBOOK.md for the release order. Rollback at the bottom.
--
-- Replaces the read list from 062 with a fixed one, and gives signed-in
-- clients fixed write lists. A new column stays private until it is added.
-- ============================================================

begin;

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

commit;

-- ============================================================
-- Verification: supabase/verify/063_verify.sql (rolls itself back).
--
-- RECOVERY if an older app build can't load profiles. Try this first, briefly:
--   grant select (postcode) on public.profiles to authenticated;
--   notify pgrst, 'reload schema';
--
-- ROLLBACK to 062:
-- begin;
-- grant insert, update on public.profiles to authenticated;
-- do $$
-- declare v_columns text;
-- begin
--   select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_columns
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name not in ('postcode', 'approx_lat', 'approx_lng');
--   execute format('grant select (%s) on public.profiles to authenticated', v_columns);
-- end $$;
-- commit;
-- notify pgrst, 'reload schema';
-- Migration 062's own rollback restores the earlier access, as a last resort.
-- ============================================================
