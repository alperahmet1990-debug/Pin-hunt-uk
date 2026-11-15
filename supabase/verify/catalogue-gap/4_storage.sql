-- Catalogue gap report, query 4 of 5: catalogue-related files (READ-ONLY)
--
-- Run in EACH project's SQL editor and download the result as CSV.
-- Records come back in chunks of 500 per row.
--
-- Lists file names, sizes and checksums (no file contents) in the buckets that
-- hold catalogue photos and the work that produces them. Only the public
-- pin-catalogue bucket's names are shown; private buckets' names are hashed. Board-scan and
-- bulk-matcher buckets exist only where migrations 075 / 076 are applied.

set default_transaction_read_only = on;

with records as (
  select
    o.bucket_id,
    -- Private buckets file uploads under account ids, so their names are hashed.
    case when o.bucket_id = 'pin-catalogue' then o.name else 'hashed:' || md5(o.name) end as name,
    (o.metadata->>'size')::bigint as size,
    o.metadata->>'eTag' as etag,
    o.metadata->>'mimetype' as mimetype,
    o.created_at,
    o.updated_at
  from storage.objects o
  where o.bucket_id in ('pin-catalogue', 'pin-contributed-images', 'board-scans', 'bulk-image-matcher')
),
numbered as (
  select r, row_number() over (order by r.bucket_id, r.name) as rn from records r
)
select
  (rn - 1) / 500 + 1 as chunk,
  count(*) as files_in_chunk,
  json_agg(r order by rn)::text as files_json
from numbered
group by 1
order by 1;
