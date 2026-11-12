-- Catalogue gap report, query 3 of 5: one row per pin_images record (READ-ONLY)
--
-- Run in EACH project's SQL editor. Download as CSV and save it as
--   <folder>/<staging|production>/3_images.csv
--
-- Pin & Pop reference rows are included only as a source + status, with no URL
-- or Pin & Pop id, so they can be counted but never copied.
-- `contributed` says a person uploaded it; who is never exported.

set default_transaction_read_only = on;

with i as (
  select i.*, to_jsonb(i) as j,
         regexp_replace(lower(coalesce(to_jsonb(i)->>'source', '')), '[^a-z]', '', 'g') in ('pinandpop', 'pinpop') as is_pnp
  from public.pin_images i
)
select
  i.id,
  p.pinhunt_id,
  i.pin_id,
  i.image_type,
  i.j->>'source' as source,
  case when i.is_pnp then null else i.j->>'source_record_id' end as source_record_id,
  i.j->>'status' as status,
  i.j->>'public_display_allowed' as public_display_allowed,
  i.is_primary,
  case when i.is_pnp then null else i.j->>'content_hash' end as content_hash,
  case when i.is_pnp then null else i.image_url end as image_url,
  (i.uploaded_by is not null) as contributed,
  i.j->>'proposal_reason' as proposal_reason,
  i.created_at,
  i.j->>'reviewed_at' as reviewed_at,
  (p.image_url is not distinct from i.image_url and not i.is_pnp) as is_pin_front_photo,
  (p.back_image_url is not distinct from i.image_url and not i.is_pnp) as is_pin_back_photo
from i
left join public.pins p on p.id = i.pin_id
order by p.pinhunt_id, i.created_at;
