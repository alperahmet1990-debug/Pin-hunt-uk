-- Production catalogue reset: PRE-CHECK (READ-ONLY)
--
-- Maintainer decision (14 Nov 2026): production's catalogue becomes Pin & Pop
-- only. The old catalogue (every pin whose catalogue_source isn't pin_and_pop)
-- is removed together with its sets, image records and photo files. Accounts,
-- profiles and settings stay. See docs/catalogue-sync/PRODUCTION-CATALOGUE-RESET.md.
--
-- This query changes NOTHING. It counts what the reset would remove or affect,
-- so the reset can be planned around real numbers. Run it in the PRODUCTION
-- SQL editor and send Claude the result (one JSON cell): counts only, no
-- names, emails or ids of people.
--
-- What it reports:
--   old_catalogue     pins (active/archived), sets, image records by source,
--                     external ids by source, pins already linked to Pin & Pop
--   references        EVERY foreign key that points at pins, found from the
--                     database itself: rows pointing at old pins, and what a
--                     delete does to them (cascade / set null / block)
--   loose_references  columns that hold pin ids or PinHunt IDs as text with
--                     no foreign key (boards, messages, scan records ...)
--   people            how many accounts have something pointing at old pins
--   storage           photo files the old pins use, and other files
--   pin_and_pop       whether any Pin & Pop pins already exist in production

set default_transaction_read_only = on;

-- "Old" means every pin whose catalogue_source isn't pin_and_pop (old_filter).
do $$
declare
  out jsonb := '{}'::jsonb;
  v jsonb;
  r record;
  n bigint;
  refs jsonb := '[]'::jsonb;
  loose jsonb := '[]'::jsonb;
  old_filter constant text := $f$coalesce(to_jsonb(pp)->>'catalogue_source', '') <> 'pin_and_pop'$f$;
begin
  if to_regprocedure('public.pinhunt_environment()') is not null then
    execute 'select to_jsonb(public.pinhunt_environment())' into v;
    out := out || jsonb_build_object('environment', v);
  end if;
  out := out || jsonb_build_object('generated_at', now());

  -- -- the old catalogue ------------------------------------------------------
  execute format($q$
    select jsonb_build_object(
      'pins_total', (select count(*) from public.pins),
      'old_pins', (select count(*) from public.pins pp where %1$s),
      'old_pins_by_status', (select coalesce(jsonb_object_agg(k, c), '{}') from (
          select coalesce(to_jsonb(pp)->>'catalogue_status', '(none)') k, count(*) c
          from public.pins pp where %1$s group by 1) s),
      'old_pins_with_photo', (select count(*) from public.pins pp where %1$s and (pp.image_url is not null or pp.back_image_url is not null)),
      'old_pin_sets', (select count(*) from public.pin_sets ps
                         where coalesce(to_jsonb(ps)->>'catalogue_source', '') <> 'pin_and_pop'),
      'old_image_records_by_source', (select coalesce(jsonb_object_agg(k, c), '{}') from (
          select coalesce(i.source, '(none)') k, count(*) c
          from public.pin_images i join public.pins pp on pp.id = i.pin_id where %1$s group by 1) s),
      'old_external_ids_by_source', (select coalesce(jsonb_object_agg(k, c), '{}') from (
          select coalesce(e.source, '(none)') k, count(*) c
          from public.pin_external_ids e join public.pins pp on pp.id = e.pin_id where %1$s group by 1) s),
      'old_pins_linked_to_pin_and_pop', (select count(distinct pp.id) from public.pins pp
          join public.pin_external_ids e on e.pin_id = pp.id
          where %1$s and regexp_replace(lower(e.source), '[^a-z]', '', 'g') in ('pinandpop', 'pinpop'))
    ) $q$, old_filter) into v;
  out := out || jsonb_build_object('old_catalogue', v);

  -- -- every foreign key pointing at pins -------------------------------------
  for r in
    select c.conrelid::regclass::text as tbl,
           a.attname as col,
           case c.confdeltype when 'c' then 'cascade (rows are deleted with the pin)'
                              when 'n' then 'set null (link is cleared)'
                              when 'd' then 'set default'
                              when 'r' then 'restrict (BLOCKS the delete)'
                              when 'a' then 'no action (BLOCKS the delete)' end as on_delete
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.pins'::regclass and array_length(c.conkey, 1) = 1
    order by 1, 2
  loop
    execute format('select count(*) from %s t join public.pins pp on pp.id = t.%I where %s', r.tbl, r.col, old_filter) into n;
    refs := refs || jsonb_build_array(jsonb_build_object('table', r.tbl, 'column', r.col, 'on_delete', r.on_delete, 'rows_on_old_pins', n));
  end loop;
  out := out || jsonb_build_object('references', refs);

  -- -- columns holding pin ids as text, with no foreign key -------------------
  for r in
    select c.table_schema || '.' || c.table_name as tbl, c.column_name as col, c.data_type, c.udt_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and (c.column_name ~ '(^|_)pin_ids?$' or c.column_name ~ 'pinhunt_id' or c.column_name in ('decided_pin_id', 'suggested_pin_id', 'matched_pinhunt_id', 'chosen_pin_id', 'thumbnail_pin_id', 'matched_pin_id', 'for_trade_pin_ids'))
      and c.table_name not in ('pins', 'pin_images', 'pin_external_ids', 'pin_set_memberships', 'pin_characters', 'pin_categories')
      and c.column_name <> 'user_pin_id'  -- points at user_pins, which is counted under references
      and not exists (
        select 1 from pg_constraint k
        join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
        where k.contype = 'f' and k.confrelid = 'public.pins'::regclass
          and k.conrelid = (c.table_schema || '.' || c.table_name)::regclass and a.attname = c.column_name)
    order by 1, 2
  loop
    if r.data_type = 'ARRAY' then
      execute format($q$select count(*) from %s t where exists (
          select 1 from public.pins pp where %s and (pp.pinhunt_id = any(t.%I::text[]) or pp.id::text = any(t.%I::text[])))$q$,
        r.tbl, old_filter, r.col, r.col) into n;
    elsif r.data_type in ('text', 'character varying', 'uuid') then
      execute format($q$select count(*) from %s t where exists (
          select 1 from public.pins pp where %s and (pp.pinhunt_id = t.%I::text or pp.id::text = t.%I::text))$q$,
        r.tbl, old_filter, r.col, r.col) into n;
    else
      continue;
    end if;
    loose := loose || jsonb_build_array(jsonb_build_object('table', r.tbl, 'column', r.col, 'rows_on_old_pins', n));
  end loop;
  out := out || jsonb_build_object('loose_references', loose);

  -- -- people affected (counts only) ------------------------------------------
  execute format($q$
    select jsonb_build_object(
      'accounts_total', (select count(*) from auth.users),
      'profiles_total', (select count(*) from public.profiles),
      'accounts_with_collection_rows_on_old_pins', (select count(distinct up.user_id) from public.user_pins up
          join public.pins pp on pp.id = up.pin_id where %1$s),
      'collection_rows_on_old_pins', (select count(*) from public.user_pins up join public.pins pp on pp.id = up.pin_id where %1$s),
      'collection_rows_by_status', (select coalesce(jsonb_object_agg(k, c), '{}') from (
          select coalesce(to_jsonb(up)->>'status', '(none)') k, count(*) c
          from public.user_pins up join public.pins pp on pp.id = up.pin_id where %1$s group by 1) s),
      'collection_rows_on_pins_linked_to_pin_and_pop', (select count(*) from public.user_pins up
          join public.pins pp on pp.id = up.pin_id
          where %1$s and exists (select 1 from public.pin_external_ids e where e.pin_id = pp.id
                                   and regexp_replace(lower(e.source), '[^a-z]', '', 'g') in ('pinandpop', 'pinpop'))),
      'boards_total', (select count(*) from public.user_boards),
      'collection_photos_on_old_pins', case when to_regclass('public.user_pin_images') is not null then (
          select count(*) from public.user_pin_images upi join public.user_pins up on up.id = upi.user_pin_id
          join public.pins pp on pp.id = up.pin_id where %1$s) end,
      'trades_total', case when to_regclass('public.trades') is not null then (select count(*) from public.trades) end
    ) $q$, old_filter) into v;
  out := out || jsonb_build_object('people', v);

  -- -- photo files ------------------------------------------------------------
  execute format($q$
    with used as (
      select distinct substring(u from '/storage/v1/object/public/pin-catalogue/(.+)$') as name
      from (select pp.image_url u from public.pins pp where %1$s
            union all select pp.back_image_url from public.pins pp where %1$s
            union all select i.image_url from public.pin_images i join public.pins pp on pp.id = i.pin_id where %1$s) x
      where u like '%%/storage/v1/object/public/pin-catalogue/%%'
    ),
    other_used as (
      select distinct substring(u from '/storage/v1/object/public/pin-catalogue/(.+)$') as name
      from (select pp.image_url u from public.pins pp where not (%1$s)
            union all select i.image_url from public.pin_images i join public.pins pp on pp.id = i.pin_id where not (%1$s)) x
      where u like '%%/storage/v1/object/public/pin-catalogue/%%'
    )
    select jsonb_build_object(
      'pin_catalogue_files_total', (select count(*) from storage.objects where bucket_id = 'pin-catalogue'),
      'pin_catalogue_bytes_total', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'pin-catalogue'),
      'files_used_by_old_pins', (select count(*) from storage.objects o where o.bucket_id = 'pin-catalogue' and o.name in (select name from used)),
      'bytes_used_by_old_pins', (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = 'pin-catalogue' and o.name in (select name from used)),
      'files_used_by_pin_and_pop_pins', (select count(*) from storage.objects o where o.bucket_id = 'pin-catalogue' and o.name in (select name from other_used)),
      'files_used_by_nothing', (select count(*) from storage.objects o where o.bucket_id = 'pin-catalogue'
                                  and o.name not in (select name from used where name is not null)
                                  and o.name not in (select name from other_used where name is not null)),
      'old_pin_photo_links_outside_storage', (select coalesce(jsonb_object_agg(h, c), '{}') from (
          select substring(u from '^https?://([^/]+)') h, count(*) c
          from (select pp.image_url u from public.pins pp where %1$s union all select pp.back_image_url from public.pins pp where %1$s) y
          where u is not null and u not like '%%/storage/v1/object/public/pin-catalogue/%%' group by 1) z),
      'other_buckets', (select coalesce(jsonb_object_agg(bucket_id, c), '{}') from (
          select bucket_id, count(*) c from storage.objects where bucket_id <> 'pin-catalogue' group by 1) b)
    ) $q$, old_filter) into v;
  out := out || jsonb_build_object('storage', v);

  -- -- Pin & Pop already present? ---------------------------------------------
  select jsonb_build_object(
    'pins', (select count(*) from public.pins pp where to_jsonb(pp)->>'catalogue_source' = 'pin_and_pop'),
    'reference_images', (select count(*) from public.pin_images where source = 'pin_and_pop'),
    'source_row', (select to_jsonb(c) - 'notes' from public.catalogue_sources c where c.id = 'pin_and_pop')
  ) into v;
  out := out || jsonb_build_object('pin_and_pop', v);

  perform set_config('pinhunt.reset_precheck', out::text, false);
end $$;

select current_setting('pinhunt.reset_precheck')::jsonb as precheck;
