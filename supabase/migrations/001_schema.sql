-- ============================================================
-- PinHunt UK — Full Database Schema
-- Migration 001: Tables, indexes, triggers
--
-- Run in order:
--   1. supabase/migrations/001_schema.sql  (this file)
--   2. supabase/migrations/002_rls.sql
--
-- All tables use id UUID PRIMARY KEY.
-- pinhunt_id (TEXT UNIQUE) is the stable public catalogue identifier.
-- ============================================================

-- ─── Shared updated_at trigger ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── profiles ────────────────────────────────────────────────────────────────
-- One row per auth.users entry. Created automatically by trigger on sign-up.

CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT        UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  location      TEXT,
  is_admin      BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create a profile row whenever a user registers.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── pins ─────────────────────────────────────────────────────────────────────
-- Master catalogue. Owned by the PinHunt import pipeline.
-- Never stores user-specific data.
--
-- id          → UUID primary key used for all foreign keys.
-- pinhunt_id  → Stable human-readable catalogue ID (PHUK-00000001).
--               Never replaced by an external provider ID.

CREATE TABLE IF NOT EXISTS pins (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pinhunt_id           TEXT        UNIQUE NOT NULL,

  title                TEXT        NOT NULL,
  brand                TEXT        NOT NULL,
  collection           TEXT        NOT NULL,          -- series / range name

  release_date         DATE,
  release_year         INTEGER,
  retail_price         NUMERIC(10, 2),
  currency             TEXT        NOT NULL DEFAULT 'GBP',
  limited_edition_size INTEGER,
  estimated_value_gbp  NUMERIC(10, 2),
  description          TEXT,
  is_new_release       BOOLEAN     NOT NULL DEFAULT false,

  origin               TEXT,                          -- Walt Disney World, Disneyland Paris…
  edition_type         TEXT,                          -- Common, Chaser, Super Chaser, LE 500…

  image_url            TEXT,                          -- front / primary catalogue image
  back_image_url       TEXT,

  -- JSONB store for quick lookup by any external key.
  -- Structured rows live in pin_external_ids for indexed queries.
  external_identifiers JSONB       NOT NULL DEFAULT '{}',

  verification_status  TEXT        NOT NULL DEFAULT 'needs_source_verification'
                         CHECK (verification_status IN (
                           'verified',
                           'needs_source_verification',
                           'community_submitted',
                           'unverified'
                         )),

  -- Operational lifecycle status (distinct from data-quality verification).
  status               TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'pending_review', 'archived')),

  is_user_submitted    BOOLEAN     NOT NULL DEFAULT false,
  submitted_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Which pipeline last wrote this record.
  catalogue_source     TEXT,                          -- 'pinhunt_import' | 'user_submission'
  catalogue_updated_at TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pins_pinhunt_id_idx      ON pins (pinhunt_id);
CREATE INDEX IF NOT EXISTS pins_brand_idx            ON pins (brand);
CREATE INDEX IF NOT EXISTS pins_collection_idx       ON pins (collection);
CREATE INDEX IF NOT EXISTS pins_status_idx           ON pins (status);
CREATE INDEX IF NOT EXISTS pins_verification_idx     ON pins (verification_status);
CREATE INDEX IF NOT EXISTS pins_new_release_idx      ON pins (is_new_release) WHERE is_new_release = true;

CREATE TRIGGER pins_updated_at
  BEFORE UPDATE ON pins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── characters ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS characters (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pin_characters (
  pin_id       UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  PRIMARY KEY (pin_id, character_id)
);

CREATE INDEX IF NOT EXISTS pin_characters_character_idx ON pin_characters (character_id);

-- ─── categories ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pin_categories (
  pin_id      UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (pin_id, category_id)
);

CREATE INDEX IF NOT EXISTS pin_categories_category_idx ON pin_categories (category_id);

-- ─── pin_external_ids ─────────────────────────────────────────────────────────
-- One row per (pin, external source). Enables indexed lookup by any provider ID.

CREATE TABLE IF NOT EXISTS pin_external_ids (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id      UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  source      TEXT        NOT NULL,   -- 'pinpics' | 'ebay' | 'sku' | 'boxlunch' | 'loungefly'…
  external_id TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pin_id, source)
);

CREATE INDEX IF NOT EXISTS pin_external_ids_pin_idx    ON pin_external_ids (pin_id);
CREATE INDEX IF NOT EXISTS pin_external_ids_source_idx ON pin_external_ids (source, external_id);

CREATE TRIGGER pin_external_ids_updated_at
  BEFORE UPDATE ON pin_external_ids
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── pin_images ───────────────────────────────────────────────────────────────
-- Catalogue reference images (front, back, community reference photos).
-- Distinct from user_pin_images which are photos of a user's own physical pins.

CREATE TABLE IF NOT EXISTS pin_images (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id       UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  image_url    TEXT        NOT NULL,
  image_type   TEXT        NOT NULL DEFAULT 'reference'
                 CHECK (image_type IN ('front', 'back', 'reference', 'scan')),
  description  TEXT,
  is_primary   BOOLEAN     NOT NULL DEFAULT false,
  uploaded_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pin_images_pin_idx ON pin_images (pin_id);

CREATE TRIGGER pin_images_updated_at
  BEFORE UPDATE ON pin_images
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── pin_sources ──────────────────────────────────────────────────────────────
-- Source URLs and verification notes per pin.

CREATE TABLE IF NOT EXISTS pin_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id      UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  source_url  TEXT        NOT NULL,
  source_name TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pin_sources_pin_idx ON pin_sources (pin_id);

CREATE TRIGGER pin_sources_updated_at
  BEFORE UPDATE ON pin_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── user_pins ────────────────────────────────────────────────────────────────
-- A user's personal pin collection entries.
-- Intentionally separate from catalogue so catalogue imports never overwrite
-- owned/wanted status, notes, or trade history.

CREATE TABLE IF NOT EXISTS user_pins (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_id              UUID        NOT NULL REFERENCES pins(id) ON DELETE RESTRICT,
  status              TEXT        NOT NULL
                        CHECK (status IN ('owned', 'wanted', 'for_trade', 'traded')),
  acquired_date       DATE,
  purchase_price_gbp  NUMERIC(10, 2),
  current_value_gbp   NUMERIC(10, 2),
  notes               TEXT,
  condition           TEXT
                        CHECK (condition IN ('mint', 'near_mint', 'good', 'fair', 'poor')),
  is_favourite        BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, pin_id)
);

CREATE INDEX IF NOT EXISTS user_pins_user_idx ON user_pins (user_id);
CREATE INDEX IF NOT EXISTS user_pins_pin_idx  ON user_pins (pin_id);
CREATE INDEX IF NOT EXISTS user_pins_status_idx ON user_pins (user_id, status);

CREATE TRIGGER user_pins_updated_at
  BEFORE UPDATE ON user_pins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── user_pin_images ──────────────────────────────────────────────────────────
-- Photos the user took of their own physical pins.
-- Independent of catalogue images; survives any catalogue refresh.

CREATE TABLE IF NOT EXISTS user_pin_images (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_pin_id  UUID        NOT NULL REFERENCES user_pins(id) ON DELETE CASCADE,
  storage_path TEXT        NOT NULL,  -- path within the 'user-pin-images' bucket
  is_primary   BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_pin_images_user_pin_idx ON user_pin_images (user_pin_id);

-- ─── pin_submissions ──────────────────────────────────────────────────────────
-- Community-submitted new pins or corrections to existing entries.
-- Require moderator approval before becoming live.

CREATE TABLE IF NOT EXISTS pin_submissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_id          UUID        REFERENCES pins(id) ON DELETE SET NULL,  -- null = new pin
  submission_type TEXT        NOT NULL
                    CHECK (submission_type IN ('new_pin', 'correction', 'image')),
  proposed_data   JSONB       NOT NULL DEFAULT '{}',
  notes           TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pin_submissions_user_idx   ON pin_submissions (submitted_by);
CREATE INDEX IF NOT EXISTS pin_submissions_status_idx ON pin_submissions (status);
CREATE INDEX IF NOT EXISTS pin_submissions_pin_idx    ON pin_submissions (pin_id);

CREATE TRIGGER pin_submissions_updated_at
  BEFORE UPDATE ON pin_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── scan_attempts ────────────────────────────────────────────────────────────
-- Log of every AI scan performed by a user.

CREATE TABLE IF NOT EXISTS scan_attempts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matched_pin_id   UUID        REFERENCES pins(id) ON DELETE SET NULL,
  confidence       NUMERIC(5, 2),
  scan_image_path  TEXT,        -- path in 'scan-images' bucket
  result_data      JSONB       NOT NULL DEFAULT '{}',  -- raw API response
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scan_attempts_user_idx ON scan_attempts (user_id);
CREATE INDEX IF NOT EXISTS scan_attempts_time_idx ON scan_attempts (created_at DESC);

-- ─── price_history ────────────────────────────────────────────────────────────
-- Historical valuation records per pin.
-- Not used by the MVP UI but schema is included so the table exists
-- and future import pipelines (eBay sold listings, manual entries) can
-- populate it without a schema migration.

CREATE TABLE IF NOT EXISTS price_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id      UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  price_gbp   NUMERIC(10, 2) NOT NULL,
  source      TEXT,              -- 'ebay_sold' | 'manual' | 'pinpics' | 'estimate'
  condition   TEXT,              -- condition at time of sale/valuation
  notes       TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_history_pin_idx  ON price_history (pin_id);
CREATE INDEX IF NOT EXISTS price_history_time_idx ON price_history (pin_id, recorded_at DESC);

-- ─── trades ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trades (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trades_different_users CHECK (initiator_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS trades_initiator_idx ON trades (initiator_id);
CREATE INDEX IF NOT EXISTS trades_recipient_idx ON trades (recipient_id);
CREATE INDEX IF NOT EXISTS trades_status_idx    ON trades (status);

CREATE TRIGGER trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── trade_items ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id     UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_pin_id  UUID        NOT NULL REFERENCES user_pins(id) ON DELETE RESTRICT,
  direction    TEXT        NOT NULL CHECK (direction IN ('offered', 'requested')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_items_trade_idx ON trade_items (trade_id);

-- ─── trade_messages ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id   UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_messages_trade_idx ON trade_messages (trade_id);
CREATE INDEX IF NOT EXISTS trade_messages_time_idx  ON trade_messages (trade_id, created_at);
