-- ============================================================================
-- PinHunt live catalogue audit: READ-ONLY. Every statement is a SELECT.
-- Run in the Supabase SQL editor on the PRODUCTION project (or staging to try it).
-- Nothing here inserts, updates or deletes. Safe to run as often as you like.
--
-- Fastest path: run QUERY 1 only, then use "Download CSV" on the results and
-- send the file to Claude. Everything in the coverage matrix is computed from it.
-- QUERIES 2–6 are quick on-screen summaries if you'd rather see numbers now.
-- ============================================================================


-- ── QUERY 1: one row per pin (export this as CSV) ───────────────────────────
-- Facts only: no user data, no image files, no secrets.
select
  p.pinhunt_id,
  p.title,
  p.collection,
  p.origin,
  p.brand,
  p.edition_type,
  p.limited_edition_size,
  p.release_year,
  p.release_date,
  p.catalogue_source,
  p.verification_status,
  p.catalogue_status,
  p.is_searchable,
  p.is_legacy_v1,
  p.is_user_submitted,
  p.main_character,
  p.all_characters,
  (p.retail_price is not null)                                   as has_price,
  (p.image_url is not null and p.image_url <> '')                as has_image_url,
  coalesce(img.n_images, 0)                                      as n_images,
  coalesce(img.n_public, 0)                                      as n_public_images,
  img.image_sources,
  sets.set_names,
  sets.n_sets,
  ext.external_sources,
  p.created_at::date                                             as created_on
from pins p
left join lateral (
  select count(*)                                                     as n_images,
         count(*) filter (where pi.public_display_allowed)            as n_public,
         string_agg(distinct coalesce(pi.source, 'unknown'), '|')     as image_sources
  from pin_images pi where pi.pin_id = p.id
) img on true
left join lateral (
  select string_agg(s.set_name, ' || ' order by s.set_name) as set_names, count(*) as n_sets
  from pin_set_memberships m join pin_sets s on s.id = m.set_id
  where m.pin_id = p.id
) sets on true
left join lateral (
  select string_agg(distinct e.source, '|') as external_sources
  from pin_external_ids e where e.pin_id = p.id
) ext on true
order by p.pinhunt_id;


-- ── QUERY 2: headline counts by source and status ───────────────────────────
select catalogue_source, verification_status, catalogue_status, is_searchable, is_legacy_v1,
       count(*) as pins,
       count(*) filter (where image_url is not null and image_url <> '') as with_image
from pins
group by 1,2,3,4,5
order by pins desc;


-- ── QUERY 3: what the public app can show (live, searchable, verified) ──────
select catalogue_source,
       count(*) as publicly_visible_pins,
       count(*) filter (where release_year between 2020 and 2026) as visible_2020_2026
from pins
where verification_status = 'verified' and is_searchable
group by 1 order by 2 desc;


-- ── QUERY 4: raw origin and edition values (to build the coverage matrix) ───
select coalesce(origin, '(none)') as origin, coalesce(edition_type, '(none)') as edition_type,
       count(*) as pins,
       count(*) filter (where release_year between 2020 and 2026) as pins_2020_2026
from pins
where coalesce(is_legacy_v1, false) = false
group by 1,2 order by pins desc
limit 300;


-- ── QUERY 5: sets: how many, how complete, how big ───────────────────────────
select coalesce(s.catalogue_source, '(legacy/none)') as source,
       count(*)                                           as sets,
       count(*) filter (where s.expected_pin_count is not null) as with_expected_count,
       count(*) filter (where s.is_complete)              as marked_complete,
       round(avg(m.n), 1)                                 as avg_members,
       sum(m.n)                                           as memberships
from pin_sets s
left join (select set_id, count(*) n from pin_set_memberships group by 1) m on m.set_id = s.id
group by 1 order by sets desc;


-- ── QUERY 6: provenance and rights per source (images and facts) ─────────────
select cs.id, cs.display_name, cs.rights_basis, cs.exact_license_variant,
       cs.public_display_allowed, cs.storage_allowed, cs.app_use_allowed,
       (select count(*) from pins p where p.catalogue_source = cs.id)               as pins,
       (select count(*) from pin_images pi where pi.source = cs.id)                 as images,
       (select count(*) from pin_images pi where pi.source = cs.id and pi.public_display_allowed) as public_images,
       (select count(*) from pin_external_ids e where e.source = cs.id)             as external_ids
from catalogue_sources cs
order by pins desc;

-- Trusted pins that were checked against Pin & Pop pages (provenance check):
select count(*) as trusted_pins,
       count(*) filter (where source_url ilike '%pinandpop%')          as pin_and_pop_source_url,
       count(*) filter (where external_identifiers ? 'pin_and_pop')    as with_pin_and_pop_id,
       count(*) filter (where is_searchable and verification_status = 'verified') as publicly_visible
from pins
where catalogue_status = 'trusted';
