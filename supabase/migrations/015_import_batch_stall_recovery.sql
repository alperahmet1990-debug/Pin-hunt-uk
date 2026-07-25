-- ============================================================
-- PinHunt UK — Migration 015: Import batch stall detection
--
-- Adds progress_updated_at to import_batches so the API can
-- detect stalled/orphaned 'running' batches (e.g. after a
-- server restart mid-import) and mark them failed on startup.
--
-- Safe to run more than once.
-- ============================================================

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS progress_updated_at TIMESTAMPTZ;

-- Backfill for existing rows so stall math has a baseline
UPDATE import_batches
SET progress_updated_at = COALESCE(completed_at, started_at)
WHERE progress_updated_at IS NULL;
