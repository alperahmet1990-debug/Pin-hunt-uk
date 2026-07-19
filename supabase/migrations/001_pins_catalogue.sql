-- ============================================================
-- PinHunt Supabase Schema
-- Run this once in the Supabase SQL editor for your project.
-- ============================================================

-- Optional: enable pgvector now so the column can be added later
-- without a full table rewrite. Comment out if the extension is unavailable.
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ── Catalogue ────────────────────────────────────────────────────────────────
-- This table is owned by the PinHunt import pipeline.
-- External data can be synced here freely.
-- It NEVER stores user-specific data.

CREATE TABLE IF NOT EXISTS pins (
  id                   TEXT PRIMARY KEY,          -- stable PinHunt internal ID

  title                TEXT        NOT NULL,
  brand                TEXT        NOT NULL,
  collection           TEXT        NOT NULL,      -- series name
  characters           TEXT[]      NOT NULL  DEFAULT '{}',

  release_date         DATE,
  retail_price_gbp     NUMERIC(10, 2),
  limited_edition_size INTEGER,
  estimated_value_gbp  NUMERIC(10, 2),
  description          TEXT,
  is_new_release       BOOLEAN     NOT NULL  DEFAULT false,
  origin               TEXT,                      -- "Walt Disney World", "Disneyland Paris", …
  edition              TEXT,                      -- "Open Edition", "LE 2500", "WDI", …

  image_url            TEXT,                      -- primary catalogue image

  -- IDs from external providers — schema-free so new sources need no migration.
  -- e.g. { "pinpicsId": "12345", "sku": "DIS-2024-ABC", "ebayItemId": "…" }
  external_identifiers JSONB       NOT NULL  DEFAULT '{}',

  status               TEXT        NOT NULL  DEFAULT 'active'
                         CHECK (status IN ('active', 'pending_review', 'rejected')),

  is_user_submitted    BOOLEAN     NOT NULL  DEFAULT false,
  submitted_by         TEXT,                      -- app-level user ID if user-submitted

  -- Which pipeline last wrote this record.
  catalogue_source     TEXT,                      -- 'pinhunt_seed' | 'pinpics_import' | 'user_submission'

  created_at           TIMESTAMPTZ NOT NULL  DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL  DEFAULT NOW(),
  catalogue_updated_at TIMESTAMPTZ           -- last external-data sync timestamp
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION pins_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pins_updated_at ON pins;
CREATE TRIGGER pins_updated_at
  BEFORE UPDATE ON pins
  FOR EACH ROW EXECUTE FUNCTION pins_set_updated_at();

-- Useful indexes
CREATE INDEX IF NOT EXISTS pins_brand_idx        ON pins (brand);
CREATE INDEX IF NOT EXISTS pins_collection_idx   ON pins (collection);
CREATE INDEX IF NOT EXISTS pins_status_idx       ON pins (status);
CREATE INDEX IF NOT EXISTS pins_new_release_idx  ON pins (is_new_release) WHERE is_new_release = true;

-- ── Reference images for scan matching ───────────────────────────────────────
-- Separate from the catalogue image_url.
-- Users can contribute reference photos; embeddings added for vector search later.

CREATE TABLE IF NOT EXISTS pin_reference_images (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id      TEXT        NOT NULL REFERENCES pins (id) ON DELETE CASCADE,
  image_url   TEXT        NOT NULL,
  description TEXT,                   -- AI-generated visual description
  -- embedding VECTOR(1536),          -- uncomment when pgvector is enabled
  is_primary  BOOLEAN     NOT NULL DEFAULT false,
  uploaded_by TEXT,                   -- user identifier
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pin_reference_images_pin_idx ON pin_reference_images (pin_id);

-- ── User collection ───────────────────────────────────────────────────────────
-- Intentionally separate from the catalogue so external imports can never
-- overwrite owned/wanted status, personal notes or trade history.
-- Currently the app uses AsyncStorage for this; this table is ready for when
-- cloud sync is added.

CREATE TABLE IF NOT EXISTS user_collection (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT        NOT NULL,
  pin_id            TEXT        NOT NULL REFERENCES pins (id),
  status            TEXT        NOT NULL CHECK (status IN ('owned', 'wanted', 'for_trade')),
  acquired_date     DATE,
  purchase_price_gbp NUMERIC(10, 2),
  notes             TEXT,
  condition         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, pin_id)
);

-- ── User pin photos ───────────────────────────────────────────────────────────
-- Photos the user took of their own physical pins.
-- Independent of catalogue images; survives any catalogue refresh.

CREATE TABLE IF NOT EXISTS user_pin_photos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,
  pin_id          TEXT        NOT NULL REFERENCES pins (id),
  object_path     TEXT        NOT NULL,   -- GCS / object-storage path
  is_primary      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Enable Row Level Security (recommended) ───────────────────────────────────
-- Uncomment and configure once authentication is wired up.
--
-- ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "pins_public_read" ON pins FOR SELECT USING (status = 'active');
--
-- ALTER TABLE user_collection ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "user_collection_own" ON user_collection
--   USING (user_id = auth.uid()::text);
--
-- ALTER TABLE user_pin_photos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "user_pin_photos_own" ON user_pin_photos
--   USING (user_id = auth.uid()::text);
