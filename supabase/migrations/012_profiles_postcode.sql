-- Migration 012: Add postcode column to profiles
--
-- Stores the last postcode a collector used for geocoding so that the
-- Edit Profile screen can pre-fill the field on subsequent visits.
-- The postcode is display-safe (no precise coordinates) and writable by
-- the authenticated role via the standard profiles RLS policy.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS postcode TEXT;

COMMENT ON COLUMN profiles.postcode IS
  'Last UK postcode used for geocoding. Display-safe — stored for UX pre-fill only.';
