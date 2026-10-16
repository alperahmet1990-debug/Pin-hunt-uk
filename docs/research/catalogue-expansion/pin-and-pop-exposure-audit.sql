-- ============================================================================
-- Pin & Pop exposure audit: READ-ONLY. Every statement is a SELECT.
-- Run in the Supabase SQL editor on PRODUCTION (or staging to try it).
-- It reads only our own database and makes no request to Pin & Pop.
-- Expected answer for a clean result: every *_public / *_visible count is 0.
-- ============================================================================

-- ── A. Pin & Pop images stored in pin_images (migration 042 reference rows) ──
-- public_display_allowed must be 0 (the 042 constraint should guarantee it).
select count(*)                                                      as pin_and_pop_image_rows,
       count(*) filter (where public_display_allowed)               as pin_and_pop_rows_public,
       count(*) filter (where uploaded_by is not null)              as pin_and_pop_rows_with_uploader,
       count(distinct pin_id)                                        as pins_with_reference_image
from pin_images
where source = 'pin_and_pop';

-- ── B. Any image row pointing at a Pin & Pop host but labelled as another source
select coalesce(source, '(none)') as labelled_source,
       count(*)                                                  as rows,
       count(*) filter (where public_display_allowed)           as rows_public
from pin_images
where image_url ilike '%pinandpop%'
  and source is distinct from 'pin_and_pop'
group by 1 order by rows desc;

-- ── C. Pin & Pop images in the pins table itself (no RLS on these columns) ───
-- pins.image_url / back_image_url are what the collector app displays.
select count(*) filter (where image_url ilike '%pinandpop%')                                   as pins_image_url_pnp,
       count(*) filter (where back_image_url ilike '%pinandpop%')                              as pins_back_image_url_pnp,
       count(*) filter (where (image_url ilike '%pinandpop%' or back_image_url ilike '%pinandpop%')
                          and verification_status = 'verified' and is_searchable)             as pnp_image_publicly_visible
from pins;

-- ── D. Pin & Pop links and IDs on publicly visible pins (facts, not images) ──
-- Not displayed by the collector app today (checked in code), but readable through the public API.
select count(*) filter (where source_url ilike '%pinandpop%')                                         as pins_with_pnp_source_url,
       count(*) filter (where external_identifiers ? 'pin_and_pop')                                      as pins_with_pnp_id,
       count(*) filter (where (source_url ilike '%pinandpop%' or external_identifiers ? 'pin_and_pop')
                          and verification_status = 'verified' and is_searchable)                       as publicly_visible
from pins;

select count(*) as pin_external_ids_pnp_rows       -- table is public-read (002_rls.sql)
from pin_external_ids
where source = 'pin_and_pop';

-- ── E. The rights record for Pin & Pop (should all be false) ────────────────
select id, public_display_allowed, storage_allowed, app_use_allowed
from catalogue_sources
where id = 'pin_and_pop';
