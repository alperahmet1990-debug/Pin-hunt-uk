-- 020: fix ambiguous "id" in get_collectors_nearby (OUT column vs CTE column)
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
      WHERE ratee_id IN (SELECT wr2.id FROM within_radius wr2)
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

