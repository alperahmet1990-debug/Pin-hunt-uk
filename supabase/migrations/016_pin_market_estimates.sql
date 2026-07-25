-- 016: eBay market valuation storage
-- Additive only. Written by the API server with the service-role key;
-- clients read values through the API server, so no anon/auth policies.

CREATE TABLE IF NOT EXISTS pin_market_estimates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id            UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  marketplace       TEXT        NOT NULL CHECK (marketplace IN ('EBAY_GB', 'EBAY_US')),
  currency          TEXT        NOT NULL,
  estimated_low     NUMERIC(10,2),
  estimated_mid     NUMERIC(10,2),
  estimated_high    NUMERIC(10,2),
  comparable_count  INTEGER     NOT NULL DEFAULT 0,
  confidence        TEXT        NOT NULL CHECK (confidence IN ('insufficient', 'low', 'medium', 'high')),
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pin_id, marketplace)
);

CREATE TABLE IF NOT EXISTS ebay_listing_snapshots (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id                 UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  ebay_item_id           TEXT        NOT NULL,
  marketplace            TEXT        NOT NULL CHECK (marketplace IN ('EBAY_GB', 'EBAY_US')),
  title                  TEXT        NOT NULL,
  item_url               TEXT,
  image_url              TEXT,       -- external marketplace evidence only, never copied into the pin image catalogue
  item_price             NUMERIC(10,2),
  delivery_price         NUMERIC(10,2),  -- NULL when delivery cost is unavailable (not treated as free)
  total_price            NUMERIC(10,2),
  currency               TEXT,
  condition              TEXT,
  relevance_score        NUMERIC(6,2),
  accepted_for_valuation BOOLEAN     NOT NULL DEFAULT false,
  retrieved_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_market_estimates_pin ON pin_market_estimates (pin_id);
CREATE INDEX IF NOT EXISTS idx_ebay_snapshots_pin ON ebay_listing_snapshots (pin_id, marketplace);

ALTER TABLE pin_market_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_listing_snapshots ENABLE ROW LEVEL SECURITY;

-- Read-only access for signed-in clients (writes stay service-role only).
CREATE POLICY "market estimates readable" ON pin_market_estimates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "listing snapshots readable" ON ebay_listing_snapshots
  FOR SELECT TO authenticated USING (true);
