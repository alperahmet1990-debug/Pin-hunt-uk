-- Catalogue gap report, query 4 of 5: catalogue-related files (READ-ONLY)
--
-- Run in EACH project's SQL editor. Download as CSV and save it as
--   <folder>/<staging|production>/4_storage.csv
--
-- Lists file names, sizes and checksums (no file contents) in the buckets that
-- hold catalogue photos and the work that produces them. Board-scan and
-- bulk-matcher buckets exist only where migrations 075 / 076 are applied.

set default_transaction_read_only = on;

select
  o.bucket_id,
  o.name,
  (o.metadata->>'size')::bigint as size,
  o.metadata->>'eTag' as etag,
  o.metadata->>'mimetype' as mimetype,
  o.created_at,
  o.updated_at
from storage.objects o
where o.bucket_id in ('pin-catalogue', 'pin-contributed-images', 'board-scans', 'bulk-image-matcher')
order by o.bucket_id, o.name;
