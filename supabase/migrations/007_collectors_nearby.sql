-- ============================================================
-- Migration 007: Collectors Nearby
-- ============================================================
-- 1. Add location / discovery columns to profiles
-- 2. Geo index for efficient nearby queries
-- 3. Haversine helper + privacy-safe distance band helper
-- 4. get_collectors_nearby RPC (SECURITY DEFINER — coords never returned to client)
-- 5. get_potential_trades RPC (SECURITY DEFINER)
-- ============================================================

-- ─── 1. Profile location / discovery columns ──────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS town                   TEXT,
  ADD COLUMN IF NOT EXISTS county                 TEXT,
  ADD COLUMN IF NOT EXISTS country                TEXT DEFAULT 'United Kingdom',
  ADD COLUMN IF NOT EXISTS approx_lat             FLOAT8,
  ADD COLUMN IF NOT EXISTS approx_lng             FLOAT8,
  ADD COLUMN IF NOT EXISTS nearby_discovery_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_radius_miles    INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS open_to_local_trades      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_to_postal_trades     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS happy_to_travel           BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. Geo index (only for opted-in profiles with coordinates) ───────────────

CREATE INDEX IF NOT EXISTS profiles_geo_idx
  ON profiles (approx_lat, approx_lng)
  WHERE nearby_discovery_enabled = true
    AND approx_lat IS NOT NULL
    AND approx_lng IS NOT NULL;

-- ─── 3. Helper functions ──────────────────────────────────────────────────────

-- Haversine great-circle distance in miles.
CREATE OR REPLACE FUNCTION haversine_miles(
  lat1 float8, lng1 float8,
  lat2 float8, lng2 float8
)
RETURNS float8
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
  R     float8 := 3958.8;
  dlat  float8 := radians(lat2 - lat1);
  dlng  float8 := radians(lng2 - lng1);
  a     float8;
BEGIN
  a := sin(dlat / 2) ^ 2
       + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ^ 2;
  RETURN R * 2 * asin(sqrt(LEAST(1.0, a)));
END;
$$;

-- Privacy-safe distance band — never reveals exact distance.
CREATE OR REPLACE FUNCTION distance_band_label(miles float8)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
BEGIN
  IF    miles <=  5 THEN RETURN 'Within 5 miles';
  ELSIF miles <= 10 THEN RETURN 'Within 10 miles';
  ELSIF miles <= 25 THEN RETURN 'Around 25 miles away';
  ELSIF miles <= 50 THEN RETURN 'Around 50 miles away';
  ELSE                   RETURN 'More than 50 miles away';
  END IF;
END;
$$;

-- Numeric sort key for distance band (for client-side sort by "Nearest").
-- Returns the band ceiling so results sort correctly without exposing exact distance.
CREATE OR REPLACE FUNCTION distance_band_sort_key(miles float8)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
BEGIN
  IF    miles <=  5 THEN RETURN 1;
  ELSIF miles <= 10 THEN RETURN 2;
  ELSIF miles <= 25 THEN RETURN 3;
  ELSIF miles <= 50 THEN RETURN 4;
  ELSE                   RETURN 5;
  END IF;
END;
$$;

-- ─── 4. get_collectors_nearby RPC ─────────────────────────────────────────────
-- SECURITY DEFINER: reads approx_lat/lng internally; NEVER returns them.
-- Only the authenticated viewer (p_viewer_id = auth.uid()) may call this.

CREATE OR REPLACE FUNCTION get_collectors_nearby(
  p_viewer_id    uuid,
  p_radius_miles integer DEFAULT 25
)
RETURNS TABLE (
  id                    uuid,
  username              text,
  avatar_url            text,
  bio                   text,
  town                  text,
  county                text,
  distance_band         text,
  distance_sort_key     integer,
  open_to_local_trades  boolean,
  open_to_postal_trades boolean,
  happy_to_travel       boolean,
  for_trade_count       bigint,
  wanted_count          bigint,
  pins_they_have_i_want bigint,
  pins_i_have_they_want bigint,
  match_score           float8,
  last_active_at        timestamptz,
  positive_ratings      bigint,
  total_ratings         bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lat float8;
  v_lng float8;
BEGIN
  -- Security: caller must be the authenticated user
  IF auth.uid() IS DISTINCT FROM p_viewer_id THEN
    RETURN;
  END IF;

  -- Read viewer's coordinates (never returned to client)
  SELECT approx_lat, approx_lng
    INTO v_lat, v_lng
    FROM profiles
   WHERE profiles.id = p_viewer_id;

  -- If viewer has no location, return nothing
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
    -- Bounding-box pre-filter (uses geo index), then exact Haversine
    candidates AS (
      SELECT
        p.id,
        haversine_miles(v_lat, v_lng, p.approx_lat, p.approx_lng) AS dist_miles
      FROM profiles p
      WHERE p.nearby_discovery_enabled = true
        AND p.profile_visibility = 'public'
        AND p.allow_messages = true
        AND p.username IS NOT NULL
        AND p.id <> p_viewer_id
        AND p.approx_lat IS NOT NULL
        AND p.approx_lng IS NOT NULL
        -- Rough bounding box: 1° lat ≈ 69 miles, 1° lng ≈ 69·cos(lat) miles
        AND p.approx_lat BETWEEN v_lat - (p_radius_miles::float8 / 69.0)
                              AND v_lat + (p_radius_miles::float8 / 69.0)
        AND p.approx_lng BETWEEN v_lng - (p_radius_miles::float8 / (69.0 * cos(radians(v_lat))))
                              AND v_lng + (p_radius_miles::float8 / (69.0 * cos(radians(v_lat))))
    ),
    within_radius AS (
      SELECT c.id, c.dist_miles
        FROM candidates c
       WHERE c.dist_miles <= p_radius_miles
    ),
    -- Viewer's wanted pins
    viewer_wanted AS (
      SELECT pin_id FROM user_pins
       WHERE user_id = p_viewer_id AND status = 'wanted'
    ),
    -- Viewer's for-trade pins
    viewer_for_trade AS (
      SELECT pin_id FROM user_pins
       WHERE user_id = p_viewer_id AND status = 'for_trade'
    ),
    -- Per-collector match counts
    match_counts AS (
      SELECT
        wr.id,
        COUNT(DISTINCT up.pin_id) FILTER (
          WHERE up.status = 'for_trade'
            AND up.pin_id IN (SELECT pin_id FROM viewer_wanted)
        ) AS they_have_i_want,
        COUNT(DISTINCT up.pin_id) FILTER (
          WHERE up.status = 'wanted'
            AND up.pin_id IN (SELECT pin_id FROM viewer_for_trade)
        ) AS i_have_they_want
      FROM within_radius wr
      LEFT JOIN user_pins up ON up.user_id = wr.id
        AND up.status IN ('for_trade', 'wanted')
      GROUP BY wr.id
    ),
    -- Trade ratings per collector
    ratings AS (
      SELECT
        ratee_id,
        COUNT(*) FILTER (WHERE is_positive) AS pos,
        COUNT(*)                             AS total
      FROM trade_ratings
      WHERE ratee_id IN (SELECT id FROM within_radius)
      GROUP BY ratee_id
    )
  SELECT
    p.id,
    p.username::text,
    p.avatar_url::text,
    p.bio::text,
    p.town::text,
    p.county::text,
    distance_band_label(wr.dist_miles)::text      AS distance_band,
    distance_band_sort_key(wr.dist_miles)::integer AS distance_sort_key,
    p.open_to_local_trades,
    p.open_to_postal_trades,
    p.happy_to_travel,
    (SELECT COUNT(*) FROM user_pins up WHERE up.user_id = p.id AND up.status = 'for_trade') AS for_trade_count,
    (SELECT COUNT(*) FROM user_pins up WHERE up.user_id = p.id AND up.status = 'wanted')    AS wanted_count,
    COALESCE(mc.they_have_i_want, 0) AS pins_they_have_i_want,
    COALESCE(mc.i_have_they_want, 0) AS pins_i_have_they_want,
    (
      -- Two-way bonus (highest weight)
      CASE WHEN COALESCE(mc.they_have_i_want, 0) > 0
                AND COALESCE(mc.i_have_they_want, 0) > 0 THEN 3 ELSE 0 END
      -- They have pins I want
      + COALESCE(mc.they_have_i_want, 0) * 2
      -- I have pins they want
      + COALESCE(mc.i_have_they_want, 0)
      -- Recency boost: active in last 7 days
      + CASE WHEN p.updated_at > NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END
      -- Inactivity penalty: inactive 30+ days
      - CASE WHEN p.updated_at < NOW() - INTERVAL '30 days' THEN 2 ELSE 0 END
      -- Distance boost: closer band = slightly higher score
      + CASE distance_band_sort_key(wr.dist_miles)
          WHEN 1 THEN 1
          WHEN 2 THEN 0
          ELSE -0
        END
    )::float8                          AS match_score,
    p.updated_at                       AS last_active_at,
    COALESCE(r.pos, 0)                 AS positive_ratings,
    COALESCE(r.total, 0)               AS total_ratings
  FROM profiles p
  JOIN within_radius wr ON wr.id = p.id
  LEFT JOIN match_counts mc ON mc.id = p.id
  LEFT JOIN ratings r ON r.ratee_id = p.id;
END;
$$;

-- ─── 5. get_potential_trades RPC ──────────────────────────────────────────────
-- Returns pins the viewer wants that the collector has for trade, and vice versa.
-- SECURITY DEFINER so it can read any user's user_pins.

CREATE OR REPLACE FUNCTION get_potential_trades(
  p_viewer_id    uuid,
  p_collector_id uuid
)
RETURNS TABLE (
  direction  text,
  pin_id     uuid,
  pinhunt_id text,
  title      text,
  image_url  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collector_public boolean;
BEGIN
  -- Security check 1: caller must be the authenticated viewer.
  IF auth.uid() IS DISTINCT FROM p_viewer_id THEN
    RETURN;
  END IF;

  -- Security check 2: target collector must have a public profile with a username
  -- set. This mirrors the existing RLS design for public profile data and prevents
  -- any authenticated user from probing arbitrary user IDs to infer their
  -- wanted/for-trade pin inventory.
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id                 = p_collector_id
      AND profile_visibility = 'public'
      AND username           IS NOT NULL
  ) INTO v_collector_public;

  IF NOT v_collector_public THEN
    RETURN;
  END IF;

  RETURN QUERY

  -- Pins the collector has for trade that the viewer wants
  SELECT
    'they_have_i_want'::text,
    p.id   AS pin_id,
    p.pinhunt_id::text,
    p.title::text,
    p.image_url::text
  FROM user_pins up_c
  JOIN user_pins up_v ON up_v.pin_id   = up_c.pin_id
                      AND up_v.user_id  = p_viewer_id
                      AND up_v.status   = 'wanted'
  JOIN pins p ON p.id = up_c.pin_id
  WHERE up_c.user_id = p_collector_id
    AND up_c.status  = 'for_trade'

  UNION ALL

  -- Pins the viewer has for trade that the collector wants
  SELECT
    'i_have_they_want'::text,
    p.id   AS pin_id,
    p.pinhunt_id::text,
    p.title::text,
    p.image_url::text
  FROM user_pins up_v
  JOIN user_pins up_c ON up_c.pin_id   = up_v.pin_id
                      AND up_c.user_id  = p_collector_id
                      AND up_c.status   = 'wanted'
  JOIN pins p ON p.id = up_v.pin_id
  WHERE up_v.user_id = p_viewer_id
    AND up_v.status  = 'for_trade';
END;
$$;
