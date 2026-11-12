-- Catalogue gap report, query 2 of 5: one row per pin (READ-ONLY)
--
-- Run in EACH project's SQL editor and download the result as CSV.
-- Pins come back in chunks of 500 per row (about 27 rows for 13,000 pins), so
-- editor row limits don't cut the export short. The comparison checks the
-- total against query 1 anyway.
--
-- `content` is the whole catalogue row as JSON, minus ids, timestamps, people,
-- private import links, photo URLs (exported separately) and Pin & Pop keys.
-- It is filled for non-archived pins only, to keep the file small; archived
-- pins still get `content_md5`, so any change is detected.

set default_transaction_read_only = on;

with p as (
  select p.id, p.pinhunt_id, p.image_url, p.back_image_url, p.created_at, p.updated_at,
         to_jsonb(p) as j
  from public.pins p
),
scrubbed as (
  select p.*,
    (select coalesce(jsonb_object_agg(k, case
              when k = 'external_identifiers' and jsonb_typeof(val) = 'object' then
                (select coalesce(jsonb_object_agg(ek, ev), '{}'::jsonb) from jsonb_each(val) as e(ek, ev)
                  where regexp_replace(lower(ek), '[^a-z]', '', 'g') not like '%pinandpop%'
                    and regexp_replace(lower(ek), '[^a-z]', '', 'g') not like '%pinpop%')
              else val end), '{}'::jsonb)
       from jsonb_each(p.j) as x(k, val)
      where k not in ('id', 'pinhunt_id', 'created_at', 'updated_at', 'catalogue_updated_at',
                      'raw_import_data', 'import_batch_id', 'image_url', 'back_image_url',
                      'needs_front_image', 'needs_back_image',
                      'submitted_by', 'uploaded_by', 'reviewed_by', 'created_by', 'updated_by',
                      'imported_by', 'changed_by', 'approved_by', 'confirmed_by', 'user_id', 'owner_id')
        and k !~ '(tsv|fts|search_vector|search_document)$'
    ) as content
  from p
),
records as (
  select
    s.pinhunt_id,
    s.id,
    s.j->>'verification_status' as verification_status,
    s.j->>'catalogue_status' as catalogue_status,
    s.j->>'is_searchable' as is_searchable,
    s.j->>'title' as title,
    s.j->>'collection' as collection,
    s.j->>'normalised_series' as normalised_series,
    s.j->>'release_year' as release_year,
    s.j->>'edition_type' as edition_type,
    s.image_url,
    s.back_image_url,
    s.created_at,
    s.updated_at,
    (select string_agg(e.source || ':' || e.external_id, ';' order by e.source, e.external_id)
       from public.pin_external_ids e
      where e.pin_id = s.id
        and regexp_replace(lower(e.source), '[^a-z]', '', 'g') not in ('pinandpop', 'pinpop')) as external_ids,
    exists (select 1 from public.pin_external_ids e
             where e.pin_id = s.id
               and regexp_replace(lower(e.source), '[^a-z]', '', 'g') in ('pinandpop', 'pinpop')) as has_pin_and_pop_link,
    md5(s.content::text) as content_md5,
    case when coalesce(s.j->>'catalogue_status', '') <> 'archived' then s.content::text end as content
  from scrubbed s
),
numbered as (
  select r, row_number() over (order by r.pinhunt_id) as rn from records r
)
select
  (rn - 1) / 500 + 1 as chunk,
  count(*) as pins_in_chunk,
  json_agg(r order by rn)::text as pins_json
from numbered
group by 1
order by 1;
