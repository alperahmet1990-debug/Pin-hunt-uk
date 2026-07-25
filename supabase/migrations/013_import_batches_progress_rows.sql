-- 013_import_batches_progress_rows.sql
--
-- Forward migration for environments that applied 011_catalogue_import.sql
-- before the progress_rows column was added to it. The column tracks live
-- import progress (rows processed so far) for the admin import screen.
--
-- Safe to run everywhere: IF NOT EXISTS makes it a no-op where the column
-- already exists (fresh installs of the updated 011, or DBs already patched).

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS progress_rows INTEGER NOT NULL DEFAULT 0;
