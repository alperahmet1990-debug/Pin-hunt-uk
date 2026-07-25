-- ============================================================
-- PinHunt UK — Migration 011: Catalogue import infrastructure
--
-- 1. Additive columns on pins for import tracking and seed/verified
--    classification.
-- 2. import_batches — tracks every Excel import run with rollback
--    snapshots so any batch can be safely undone.
-- 3. pin_import_field_history — audit log of field changes made by
--    imports (for future correction-workflow UI).
-- 4. RLS policies for the two new tables (admin-only).
--
-- Run AFTER 001–010.
-- Safe to run more than once (IF NOT EXISTS / DO $$ guards).
-- ============================================================

-- ─── Additive columns on pins ─────────────────────────────────────────────────

ALTER TABLE pins
  ADD COLUMN IF NOT EXISTS manufacturer      TEXT,
  ADD COLUMN IF NOT EXISTS retailer          TEXT,
  ADD COLUMN IF NOT EXISTS source_url        TEXT,
  ADD COLUMN IF NOT EXISTS confidence_level  TEXT
    CHECK (confidence_level IN ('verified', 'high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS is_seed_record    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_front_image BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_back_image  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_batch_id   UUID,
  ADD COLUMN IF NOT EXISTS raw_import_data   JSONB;

-- Useful indexes for seed/review filtering
CREATE INDEX IF NOT EXISTS pins_is_seed_record_idx
  ON pins (is_seed_record) WHERE is_seed_record = true;
CREATE INDEX IF NOT EXISTS pins_needs_review_idx
  ON pins (needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS pins_import_batch_idx
  ON pins (import_batch_id);

-- ─── import_batches ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_batches (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT        NOT NULL,
  file_hash     TEXT        NOT NULL,          -- SHA-256 of the uploaded buffer
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
  total_rows    INTEGER     NOT NULL DEFAULT 0,
  inserted_rows INTEGER     NOT NULL DEFAULT 0,
  updated_rows  INTEGER     NOT NULL DEFAULT 0,
  skipped_rows  INTEGER     NOT NULL DEFAULT 0,
  error_rows    INTEGER     NOT NULL DEFAULT 0,
  seed_rows     INTEGER     NOT NULL DEFAULT 0,
  verified_rows INTEGER     NOT NULL DEFAULT 0,
  imported_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  error_report  JSONB,
  -- For rollback: stores the pre-import snapshot for every row that was inserted
  -- or updated. Key = pinhunt_id, value = previous DB row (null for inserts).
  row_snapshots JSONB       NOT NULL DEFAULT '{}',
  -- Live progress counter: incremented after each mini-batch during async processing
  progress_rows INTEGER     NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_admin_all"
  ON import_batches FOR ALL
  USING    (is_admin())
  WITH CHECK (is_admin());

-- ─── pin_import_field_history ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pin_import_field_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  batch_id   UUID        REFERENCES import_batches(id) ON DELETE SET NULL,
  field_name TEXT        NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  changed_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  source     TEXT,                                    -- 'import' | 'admin_edit' | 'community_correction'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pin_import_field_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pin_import_history_admin_all"
  ON pin_import_field_history FOR ALL
  USING    (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS pin_import_history_pin_idx
  ON pin_import_field_history (pin_id);
CREATE INDEX IF NOT EXISTS pin_import_history_batch_idx
  ON pin_import_field_history (batch_id);
