-- ============================================================
-- Migration 008: Profiles RLS hardening
-- ============================================================
-- Context
-- -------
-- Migration 002 created a broad "profiles_select_authenticated" policy:
--   USING (auth.uid() IS NOT NULL)
-- Any authenticated caller could SELECT every column in profiles.
--
-- Migration 007 added approx_lat / approx_lng — approximate coordinates
-- intended to stay server-side only, never returned to clients.
-- The broad policy made those coordinates queryable by any signed-in user.
--
-- This migration closes that gap with two complementary mechanisms:
--
--   A. Column-level privilege revocation
--      REVOKE SELECT (approx_lat, approx_lng) from the authenticated and
--      anon roles. This is enforced at the database layer regardless of
--      which RLS policy is active — no combination of SELECT * or explicit
--      column selection can return coordinates to a client session.
--      SECURITY DEFINER functions run as their owner (service role) and
--      retain full column access, so get_collectors_nearby is unaffected.
--
--   B. Tighter row-level policies replacing the broad one
--      Three narrowly-scoped SELECT policies replace the single broad one.
--      The admin policy uses the existing is_admin() SECURITY DEFINER
--      helper (defined in 002_rls.sql) to avoid self-referential evaluation.
-- ============================================================

-- ── A1. Add has_location_set — a safe, client-readable boolean ────────────────
-- approx_lat / approx_lng must not be client-readable. Rather than having app
-- code derive hasLocationSet by reading those columns, we maintain a safe
-- boolean that is kept in sync by a trigger. Client code reads this flag;
-- coordinates remain server-side only.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_location_set boolean NOT NULL DEFAULT false;

-- Back-fill existing rows.
UPDATE profiles
   SET has_location_set = (approx_lat IS NOT NULL)
 WHERE has_location_set IS DISTINCT FROM (approx_lat IS NOT NULL);

-- Trigger function: keeps has_location_set in sync whenever approx_lat changes.
CREATE OR REPLACE FUNCTION sync_has_location_set()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.has_location_set := (NEW.approx_lat IS NOT NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_has_location_set ON profiles;
CREATE TRIGGER trg_sync_has_location_set
  BEFORE INSERT OR UPDATE OF approx_lat, approx_lng
  ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_has_location_set();

-- ── A2. Column-level privilege revocation ─────────────────────────────────────
-- Prevents authenticated/anon callers from reading coordinate columns,
-- regardless of which row-level policy they match.
-- SECURITY DEFINER RPCs (get_collectors_nearby) are unaffected because
-- they execute with the function owner's privileges, not the caller's.
-- has_location_set (above) is NOT revoked — it is safe for clients to read.

REVOKE SELECT (approx_lat, approx_lng)
  ON public.profiles
  FROM authenticated, anon;

-- ── B1. Drop the legacy broad SELECT policy ───────────────────────────────────

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;

-- ── B2. Own-row full access ───────────────────────────────────────────────────
-- The profile owner can read every column on their own row.
-- Combined with the column revoke above, approx_lat/approx_lng are still
-- excluded from client reads even for the owner's own row — their coordinates
-- are only accessible via SECURITY DEFINER RPCs.

CREATE POLICY "profiles_select_own"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- ── B3. Public-profile read ───────────────────────────────────────────────────
-- Any authenticated user can read public profiles (needed for trades/search).
-- Column revoke ensures coordinates are never included even in SELECT *.

CREATE POLICY "profiles_select_public"
  ON profiles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND profile_visibility = 'public'
    AND username IS NOT NULL
  );

-- ── B4. Admin full-read ───────────────────────────────────────────────────────
-- Uses the existing is_admin() SECURITY DEFINER helper (002_rls.sql) to avoid
-- a self-referential subquery inside a profiles SELECT policy.

CREATE POLICY "profiles_select_admin"
  ON profiles
  FOR SELECT
  USING (is_admin());

-- ── Verification notes ────────────────────────────────────────────────────────
-- After applying, verify the effective policy set:
--
--   SELECT policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename = 'profiles'
--   ORDER BY policyname;
--
-- Expected policies on profiles:
--   profiles_insert_own    | INSERT
--   profiles_select_admin  | SELECT | is_admin()
--   profiles_select_own    | SELECT | auth.uid() = id
--   profiles_select_public | SELECT | auth.uid() IS NOT NULL AND ...
--   profiles_update_own    | UPDATE | id = auth.uid()
--
-- Verify column revoke:
--
--   SELECT has_column_privilege('authenticated', 'profiles', 'approx_lat', 'SELECT');
--   -- Expected: false
--
--   SELECT has_column_privilege('authenticated', 'profiles', 'username', 'SELECT');
--   -- Expected: true
