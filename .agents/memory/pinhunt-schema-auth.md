---
name: PinHunt schema & auth implementation
description: Migration completion status, outstanding manual steps, and key decisions through batch 5 (Collectors Nearby).
---

## Completed migrations

| # | File | Status |
|---|------|--------|
| 001 | schema + pins catalogue | ✅ applied |
| 002 | RLS policies | ✅ applied |
| 003 | profiles v2 | ✅ applied |
| 004 | external_sale_listings | ✅ applied |
| 005 | pin_submissions_v2 | ✅ applied |
| 006 | trade_ratings | ✅ applied |
| 007 | collectors_nearby | ✅ applied |
| 008 | profiles_rls_hardening | ✅ applied |

## Migration 007 — what it adds

- Columns on `profiles`: `town`, `county`, `country`, `approx_lat`, `approx_lng` (internal-only), `nearby_discovery_enabled` (default false), `preferred_radius_miles` (default 25), `open_to_local_trades`, `open_to_postal_trades`, `happy_to_travel`
- Filtered B-tree index on `(approx_lat, approx_lng) WHERE nearby_discovery_enabled = true`
- Helper functions: `haversine_miles`, `distance_band_label`, `distance_band_sort_key`
- RPC `get_collectors_nearby(p_viewer_id, p_radius_miles)` — SECURITY DEFINER, reads coords internally, returns safe fields + match scores, never exposes lat/lng
- RPC `get_potential_trades(p_viewer_id, p_collector_id)` — SECURITY DEFINER, requires `p_collector_id` to have `profile_visibility='public' AND username IS NOT NULL` before reading `user_pins`

## Migration 008 — what it adds

- `has_location_set` boolean column on profiles (default false) — safe for client reads
- `sync_has_location_set` trigger — keeps `has_location_set` in sync with `approx_lat`
- `REVOKE SELECT (approx_lat, approx_lng) ON profiles FROM authenticated, anon` — coordinate columns are column-revoked for client roles; SECURITY DEFINER RPCs unaffected
- Drops `profiles_select_authenticated` (broad any-authenticated-user SELECT)
- Adds: `profiles_select_own` (auth.uid()=id), `profiles_select_public` (public+username set), `profiles_select_admin` (uses `is_admin()` helper — avoids self-referential subquery)
- Adds `public_profiles_safe` security-barrier view excluding coordinates

## Key decisions

**approx_lat/lng are never client-readable.** Coordinate columns are column-revoked for `authenticated`/`anon` (migration 008). SECURITY DEFINER RPCs are the only access path for coordinate-based computation.

**`has_location_set` replaces client-side approx_lat derivation.** A trigger-maintained boolean column is used by the app to know whether a user has coords set, without reading the coords themselves. Kept in `SAFE_PROFILE_COLUMNS` (not revoked).

**Migration-safe fallback in repository.** `getProfile` and `updateProfile` try `SAFE_PROFILE_COLUMNS` first; if they get a `42703` (column not found) error, they retry with `BASE_PROFILE_COLUMNS` (pre-007 columns only). This keeps the app working even when migrations 007/008 haven't been applied yet.

**`getPublicProfile` and `searchCollectors` use `profiles` table directly** (not `public_profiles` view) with explicit safe column list, so migration-007 local-discovery fields are available without updating the view.

**`get_potential_trades` authorization.** Verifies `p_collector_id` has `profile_visibility='public' AND username IS NOT NULL` before reading their `user_pins`. Prevents arbitrary ID probing via SECURITY DEFINER bypass.

**Nearby screen gates on `nearbyDiscoveryEnabled`** (not `hasLocationSet`). Users who have enabled discovery but don't yet have coordinates (before geocoding step is built) can access the screen and see an empty state with guidance.

## Outstanding manual steps

1. ~~Run migration 007~~ ✅ applied
2. ~~Run migration 008~~ ✅ applied
3. Set `approx_lat`/`approx_lng` for test users via admin SQL (geocoding UI is a follow-up task)
4. Verify column revoke: `SELECT has_column_privilege('authenticated', 'profiles', 'approx_lat', 'SELECT');` → should return false

## Username-only identity (completed earlier)

`display_name` column stays in DB but is unused. All UI shows `@username` only. No migration needed.
