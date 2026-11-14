#!/usr/bin/env node
// Builds the production MOVE-AND-CLEAN SQL from the confirmed photo links
// (docs/catalogue-sync/PRODUCTION-CATALOGUE-RESET.md, steps 5-6; decision A).
// Collectible PinTrader pins with NO confirmed Pin & Pop match are KEPT as they
// are (maintainer, 14 Nov 2026): Pin & Pop may simply not list them.
//
//   node scripts/catalogue-gap/build-move-and-clean-sql.mjs <out-dir> <links files...>
//
// <links files>: any mix of
//   confirmed-links.csv   (ctp_pinhunt_id, pin_and_pop_pinhunt_id, ...)   test-batch links
//   decisions-N.json      ([{ ctp, pin }] from the full-run review pages; pin null = unlinked)
// Later files override earlier ones for the same old pin.
//
// Writes two files (they hold PinHunt IDs only, no personal data):
//   move-and-clean.PREVIEW.sql   read-only: what would move, attach and be deleted
//   move-and-clean.APPLY.sql     one all-or-nothing block, PRODUCTION only
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./core.mjs";

const PHID = /^PHUK-\d{8,}$/;

export function readLinks(files) {
  const map = new Map(); // old pinhunt_id -> Pin & Pop pinhunt_id | null
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (f.endsWith(".json")) {
      for (const d of JSON.parse(text)) if (PHID.test(d.ctp ?? "")) map.set(d.ctp, d.pin && PHID.test(d.pin) ? d.pin : null);
    } else {
      for (const r of parseCsv(text)) if (PHID.test(r.ctp_pinhunt_id ?? "") && PHID.test(r.pin_and_pop_pinhunt_id ?? "")) map.set(r.ctp_pinhunt_id, r.pin_and_pop_pinhunt_id);
    }
  }
  return [...map].filter(([, pin]) => pin).map(([old, pin]) => ({ old, pin }));
}

/** Shared by preview and apply: the guard and the resolved mapping as temp tables. */
function setup(links, { readOnly }) {
  const values = links.length ? links.map((l) => `('${l.old}','${l.pin}')`).join(",\n    ") : "(null::text, null::text)";
  return `  -- Production only.
  if exists (select 1 from storage.buckets where id = 'pinhunt-staging-marker') then
    raise exception 'This is the staging project. Nothing was changed.';
  end if;
  if to_regprocedure('public.pinhunt_environment()') is null or (select public.pinhunt_environment()) is distinct from 'production' then
    raise exception 'This project is not production (pinhunt_environment()). Nothing was changed.';
  end if;
  if (select count(*) from public.pins where catalogue_source = 'pin_and_pop') < 116000 then
    raise exception 'Pin & Pop is not imported here yet (fewer than 116,000 Pin & Pop pins). Nothing was changed.';
  end if;

  -- Confirmed photo links from the review (old PinHunt ID -> Pin & Pop PinHunt ID).
  create temp table _links on commit drop as
  select * from (values
    ${values}
  ) v(old_phid, new_phid) where old_phid is not null;

  -- Plus old pins already linked to Pin & Pop by id (external_ids 'pin_pop' / 'pin_and_pop').
  create temp table _map on commit drop as
  select distinct on (old_phid) old_phid, new_phid, photo from (
    select old_phid, new_phid, true as photo, 1 as pri from _links
    union all
    select p.pinhunt_id, 'PHUK-' || (10000000 + e.external_id::bigint)::text, false, 2
      from public.pins p join public.pin_external_ids e on e.pin_id = p.id
     where regexp_replace(lower(e.source), '[^a-z]', '', 'g') in ('pinpop', 'pinandpop')
       and coalesce(p.catalogue_source, '') <> 'pin_and_pop'
       and e.external_id ~ '^[0-9]{1,7}$'
  ) s order by old_phid, pri;

  create temp table _mm on commit drop as
  select o.id as old_id, o.pinhunt_id as old_phid, o.image_url as old_image, o.back_image_url as old_back,
         n.id as new_id, n.pinhunt_id as new_phid, m.photo,
         (select e.external_id from public.pin_external_ids e where e.pin_id = o.id and e.source = 'collectible_pintrader' limit 1) as ctp_id
    from _map m
    join public.pins o on o.pinhunt_id = m.old_phid and coalesce(o.catalogue_source, '') <> 'pin_and_pop'
    join public.pins n on n.pinhunt_id = m.new_phid and n.catalogue_source = 'pin_and_pop';

  -- Collectible PinTrader pins with no confirmed match are KEPT, with their
  -- photo, sets and everyone's collection entries (maintainer, 14 Nov 2026).
  create temp table _keep on commit drop as
  select p.id, p.pinhunt_id from public.pins p
   where coalesce(p.catalogue_source, '') <> 'pin_and_pop'
     and (p.catalogue_source = 'collectible_pintrader'
          or exists (select 1 from public.pin_external_ids e where e.pin_id = p.id and e.source = 'collectible_pintrader'))
     and not exists (select 1 from _mm m where m.old_id = p.id);

  -- Everything else that isn't Pin & Pop is the old catalogue to remove.
  create temp table _old on commit drop as
  select id, pinhunt_id from public.pins p where coalesce(catalogue_source, '') <> 'pin_and_pop'
     and not exists (select 1 from _keep k where k.id = p.id);
`;
}

const SUMMARY_COUNTS = `
    'links_in_file', (select count(*) from _links),
    'old_pins_mapped', (select count(*) from _mm),
    'links_not_resolved', (select count(*) from _map) - (select count(*) from _mm),
    'ctp_pins_kept_no_match', (select count(*) from _keep),
    'old_pins_to_delete_active', (select count(*) from public.pins p join _old o on o.id = p.id where p.catalogue_status is distinct from 'archived'),`;

export function previewSql(links) {
  return `-- MOVE-AND-CLEAN PREVIEW (READ-ONLY), production
-- GENERATED by scripts/catalogue-gap/build-move-and-clean-sql.mjs (${links.length} confirmed photo links).
-- Shows what move-and-clean.APPLY.sql would do. Changes nothing: it only reads
-- real tables, and its scratch work goes into temporary tables that are dropped
-- automatically when it finishes. Counts only.

do $$
declare out jsonb;
begin
${setup(links, { readOnly: true })}
  select jsonb_build_object(${SUMMARY_COUNTS}
    'photos_to_attach', (select count(distinct new_id) from _mm where photo and old_image like '%/storage/v1/object/public/pin-catalogue/collectible-pintrader/%'),
    'pin_and_pop_pins_already_with_photo', (select count(distinct m.new_id) from _mm m join public.pins n on n.id = m.new_id where m.photo and n.image_url is not null),
    'collection_entries_kept_on_ctp_pins', (select count(*) from public.user_pins up join _keep k on k.id = up.pin_id),
    'collection_entries_on_pins_to_delete', (select count(*) from public.user_pins up join _old o on o.id = up.pin_id),
    'collection_entries_to_move', (select count(*) from public.user_pins up join _mm m on m.old_id = up.pin_id
        where not exists (select 1 from public.user_pins x where x.user_id = up.user_id and x.pin_id = m.new_id)),
    'collection_entries_merged_into_existing', (select count(*) from public.user_pins up join _mm m on m.old_id = up.pin_id
        where exists (select 1 from public.user_pins x where x.user_id = up.user_id and x.pin_id = m.new_id)),
    'collection_entries_to_delete_unmatched', (select count(*) from public.user_pins up join _old o on o.id = up.pin_id
        where not exists (select 1 from _mm m where m.old_id = up.pin_id)),
    'collection_entries_to_delete_by_status', (select coalesce(jsonb_object_agg(status, c), '{}') from (select up.status, count(*) c from public.user_pins up join _old o on o.id = up.pin_id
        where not exists (select 1 from _mm m where m.old_id = up.pin_id) group by 1) s),
    'accounts_losing_entries', (select count(distinct up.user_id) from public.user_pins up join _old o on o.id = up.pin_id
        where not exists (select 1 from _mm m where m.old_id = up.pin_id)),
    'community_posts_relinked', (select count(*) from public.community_posts c join _mm m on m.old_id = c.linked_pin_id),
    'community_posts_link_cleared', (select count(*) from public.community_posts c join _old o on o.id = c.linked_pin_id where not exists (select 1 from _mm m where m.old_id = c.linked_pin_id)),
    'conversations_relinked', (select count(*) from public.conversations c join _mm m on m.old_id = c.context_pin_id),
    'trade_items_link_cleared_kept_as_history', (select count(*) from public.trade_items t join _old o on o.id = t.pin_id),
    'tracked_old_sets_removed', (select count(*) from public.user_tracked_sets u join public.pin_sets s on s.id = u.set_id where coalesce(s.catalogue_source, '') <> 'pin_and_pop'
        and not exists (select 1 from public.pin_set_memberships ms join _keep k on k.id = ms.pin_id where ms.set_id = s.id)),
    'old_pin_sets_to_delete', (select count(*) from public.pin_sets s where coalesce(s.catalogue_source, '') <> 'pin_and_pop'
        and not exists (select 1 from public.pin_set_memberships ms join _keep k on k.id = ms.pin_id where ms.set_id = s.id)),
    'old_pin_sets_kept', (select count(*) from public.pin_sets s where coalesce(s.catalogue_source, '') <> 'pin_and_pop'
        and exists (select 1 from public.pin_set_memberships ms join _keep k on k.id = ms.pin_id where ms.set_id = s.id)),
    'old_pins_to_delete', (select count(*) from _old)
  ) into out;
  perform set_config('pinhunt.move_preview', out::text, false);
end $$;

select current_setting('pinhunt.move_preview')::jsonb as preview;
`;
}

export function applySql(links) {
  return `-- MOVE-AND-CLEAN APPLY, production (decision A, 14 Nov 2026)
-- GENERATED by scripts/catalogue-gap/build-move-and-clean-sql.mjs (${links.length} confirmed photo links).
--
-- ONE all-or-nothing block: if any step fails, nothing changes.
--   1. Collection entries on old pins with a confirmed Pin & Pop match move to
--      that pin (if the person already has it, the old entry is merged away).
--      Their location rows move with them. Community posts, conversations and
--      approved submissions are relinked.
--   2. Each matched Pin & Pop pin that has no photo gets the Collectible
--      PinTrader photo: the SAME file in pin-catalogue/collectible-pintrader/,
--      nothing copied, plus a pin_images record of where it came from.
--   3. Collectible PinTrader pins with NO match are KEPT as they are, with
--      their photo, sets and everyone's entries (Pin & Pop may not list them).
--   4. Decision A: entries on the remaining old pins (archived seed pins and
--      any other non-Collectible-PinTrader pin) are deleted.
--   5. Those old pins are deleted (their images, links, market rows and
--      caches go with them), then old sets left with no pins. Trade items keep their
--      title and old PinHunt ID as history; only their pin link clears.
--      Photo FILES are never deleted.
--
-- Run move-and-clean.PREVIEW.sql first and check its numbers. Back up first.

do $$
declare out jsonb; n_moved int; n_merged int; n_deleted int; n_photos int; n_pins int; n_sets int;
begin
${setup(links, { readOnly: false })}
  -- 1. Move collection entries (and their locations) to the matched Pin & Pop pin.
  create temp table _loc on commit drop as
    select l.*, m.new_id from public.user_pin_locations l join _mm m on m.old_id = l.pin_id;
  delete from public.user_pin_locations l using _mm m where m.old_id = l.pin_id;

  -- Merging into an entry the person already has: keep the more useful status
  -- (for trade > owned > traded > wanted), so a "for trade" flag isn't lost.
  update public.user_pins x set status = up.status
    from public.user_pins up join _mm m on m.old_id = up.pin_id
   where x.user_id = up.user_id and x.pin_id = m.new_id
     and (case up.status when 'for_trade' then 3 when 'owned' then 2 when 'traded' then 1 else 0 end)
       > (case x.status when 'for_trade' then 3 when 'owned' then 2 when 'traded' then 1 else 0 end);
  delete from public.user_pins up using _mm m
   where up.pin_id = m.old_id
     and exists (select 1 from public.user_pins x where x.user_id = up.user_id and x.pin_id = m.new_id);
  get diagnostics n_merged = row_count;
  -- one old pin per (person, new pin): if two old pins map to the same new pin, keep the first
  delete from public.user_pins up using _mm m
   where up.pin_id = m.old_id
     and exists (select 1 from public.user_pins y join _mm m2 on m2.old_id = y.pin_id
                  where y.user_id = up.user_id and m2.new_id = m.new_id and y.id < up.id);
  update public.user_pins up set pin_id = m.new_id from _mm m where up.pin_id = m.old_id;
  get diagnostics n_moved = row_count;
  insert into public.user_pin_locations select (jsonb_populate_record(null::public.user_pin_locations, to_jsonb(l) - 'new_id' || jsonb_build_object('pin_id', l.new_id))).* from _loc l
    where exists (select 1 from public.user_pins up where up.user_id = l.user_id and up.pin_id = l.new_id)
    on conflict do nothing;

  update public.community_posts c set linked_pin_id = m.new_id from _mm m where c.linked_pin_id = m.old_id;
  update public.conversations c set context_pin_id = m.new_id from _mm m where c.context_pin_id = m.old_id;
  update public.pin_submissions s set approved_pin_id = m.new_id from _mm m where s.approved_pin_id = m.old_id;
  update public.user_boards b set pin_ids = (select array_agg(coalesce(m.new_phid, x) order by i) from unnest(b.pin_ids) with ordinality u(x, i) left join _mm m on m.old_phid = x)
   where b.pin_ids && (select array_agg(old_phid) from _mm);

  -- 2. Attach Collectible PinTrader photos (same files; nothing copied).
  update public.pins n set image_url = m.old_image, needs_front_image = false,
         back_image_url = coalesce(n.back_image_url, case when m.old_back like '%/storage/v1/object/public/pin-catalogue/collectible-pintrader/%' then m.old_back end)
    from (select distinct on (new_id) * from _mm where photo and old_image like '%/storage/v1/object/public/pin-catalogue/collectible-pintrader/%' order by new_id, old_phid) m
   where n.id = m.new_id and n.image_url is null;
  get diagnostics n_photos = row_count;
  insert into public.pin_images (pin_id, image_url, image_type, source, source_record_id, status, public_display_allowed, attribution_required, is_primary, uploaded_by, description)
  select m.new_id, m.old_image, 'front', 'collectible_pintrader', m.ctp_id, 'approved', true,
         coalesce((select attribution_required from public.catalogue_sources where id = 'collectible_pintrader'), true), true, null,
         'Collectible PinTrader photo linked to this Pin & Pop pin by PinHunt match review (Nov 2026); was ' || m.old_phid
    from (select distinct on (new_id) * from _mm where photo and old_image like '%/storage/v1/object/public/pin-catalogue/collectible-pintrader/%' order by new_id, old_phid) m
    join public.pins n on n.id = m.new_id and n.image_url = m.old_image;

  -- 3. Decision A: entries on old pins being removed are deleted (their locations
  --    cascade). Entries on kept Collectible PinTrader pins (_keep) are untouched.
  delete from public.user_pins up using _old o where up.pin_id = o.id;
  get diagnostics n_deleted = row_count;

  -- 4. Clear what would block deleting old pins, then delete the old catalogue.
  update public.pin_submissions s set approved_pin_id = null from _old o where s.approved_pin_id = o.id;
  update public.pin_ebay_validations v set suspected_duplicate_pin_id = null from _old o where v.suspected_duplicate_pin_id = o.id;
  delete from public.pins p using _old o where p.id = o.id;
  get diagnostics n_pins = row_count;
  delete from public.pin_sets s where coalesce(s.catalogue_source, '') <> 'pin_and_pop'
    and not exists (select 1 from public.pin_set_memberships ms where ms.set_id = s.id);
  get diagnostics n_sets = row_count;

  out := jsonb_build_object(
    'collection_entries_moved', n_moved, 'collection_entries_merged', n_merged, 'collection_entries_deleted', n_deleted,
    'photos_attached', n_photos, 'old_pins_deleted', n_pins, 'old_sets_deleted', n_sets,
    'ctp_pins_kept', (select count(*) from _keep),
    'pins_now', (select count(*) from public.pins),
    'pin_and_pop_pins_with_photo', (select count(*) from public.pins where catalogue_source = 'pin_and_pop' and image_url is not null),
    'non_pin_and_pop_pins_left', (select count(*) from public.pins where coalesce(catalogue_source, '') <> 'pin_and_pop'));
  perform set_config('pinhunt.move_result', out::text, false);
end $$;

select current_setting('pinhunt.move_result')::jsonb as result;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [outDir, ...files] = process.argv.slice(2);
  if (!outDir || !files.length) { console.error("Usage: build-move-and-clean-sql.mjs <out-dir> <links files...>"); process.exit(1); }
  const links = readLinks(files);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "move-and-clean.PREVIEW.sql"), previewSql(links));
  fs.writeFileSync(path.join(outDir, "move-and-clean.APPLY.sql"), applySql(links));
  console.log(`Wrote PREVIEW and APPLY with ${links.length} confirmed links to ${outDir}`);
}
