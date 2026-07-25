-- Allow admin-approved dry-run images to be recorded as applied.
alter table ebay_image_dry_run_results add column if not exists applied_at timestamptz;
