-- 013_import_batches_progress_rows.sql
--
-- Forward migration for environments that applied 011_catalogue_import.sql
-- BEFORE the progress_rows column was added to that file. The API reads and
-- writes import_batches.progress_rows for live import progress; without this
-- column those endpoints fail with "column does not exist".
--
-- Idempotent: safe to run in environments where 011 already created the column.

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS progress_rows INTEGER NOT NULL DEFAULT 0;
