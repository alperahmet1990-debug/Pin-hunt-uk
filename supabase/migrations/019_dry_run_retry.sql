-- Track eBay listings an admin has rejected so retries find a different image.
alter table ebay_image_dry_run_results
  add column if not exists excluded_item_ids text[] not null default '{}';
