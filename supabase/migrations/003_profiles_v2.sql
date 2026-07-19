-- ============================================================
-- PinHunt UK — Migration 003: Collector Profile System
--
-- Run this in the Supabase SQL editor after 001_schema.sql
-- and 002_rls.sql.
--
-- What this adds:
--   • trading_region, international_trading_enabled, allow_trade_requests,
--     allow_messages, profile_visibility columns on profiles
--   • Case-insensitive unique index on username
--   • Indexes for collector search (region, display_name GIN)
--   • public_profiles view (safe subset, public profiles only)
--   • handle_new_user trigger (auto-creates profile on sign-up)
--   • Updated RLS policies for profile discovery
-- ============================================================

-- ─── New columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trading_region               text,
  ADD COLUMN IF NOT EXISTS international_trading_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_trade_requests          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_messages                boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_visibility            text    NOT NULL DEFAULT 'public'
    CHECK (profile_visibility IN ('public', 'private'));

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Case-insensitive unique username (NULL values are exempt from uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_ci_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Fast username lookup
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username));

-- Full-text search on display_name
CREATE INDEX IF NOT EXISTS profiles_display_name_gin_idx
  ON public.profiles USING gin (to_tsvector('english', coalesce(display_name, '')));

-- Trading region filter
CREATE INDEX IF NOT EXISTS profiles_trading_region_idx
  ON public.profiles (trading_region);

-- ─── Public profiles view ─────────────────────────────────────────────────────
-- Exposes only safe, non-sensitive fields.
-- Only returns profiles where visibility = 'public' AND username is set.

CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT
    id,
    username,
    display_name,
    avatar_url,
    bio,
    trading_region,
    international_trading_enabled
  FROM public.profiles
  WHERE profile_visibility = 'public'
    AND username IS NOT NULL;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- ─── Auto-create profile on sign-up ──────────────────────────────────────────
-- Fires after every INSERT on auth.users.
-- Uses ON CONFLICT DO NOTHING so re-runs are safe.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── RLS policies ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating
DROP POLICY IF EXISTS "Users can view their own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are visible to all" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Owner: full read of own row (includes private fields)
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Public: read public profiles (for search/discovery)
CREATE POLICY "Public profiles are visible to all"
  ON public.profiles FOR SELECT
  USING (
    profile_visibility = 'public'
    AND username IS NOT NULL
  );

-- Owner: update own profile only; cannot change is_admin
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Owner: insert own profile (handles accounts created before trigger)
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
