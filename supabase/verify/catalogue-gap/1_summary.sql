-- Catalogue gap report, query 1 of 5: summary (READ-ONLY)
--
-- Run in the Supabase SQL editor of EACH project (staging, then production).
-- It changes nothing: the session is read-only, and the only statement that
-- is not a SELECT stores the result in a session setting so the last line
-- can show it. Nothing is written to any table or file.
--
-- Output: one row, one column `summary` (JSON). Copy the cell into
--   <folder>/<staging|production>/1_summary.json
-- See docs/catalogue-sync/GAP-REPORT.md.
--
-- Works whichever migrations the project has: optional tables and columns
-- are checked before use. No personal data: no user ids, emails or names.
-- Pin & Pop links and images are counted only, never listed.

set default_transaction_read_only = on;

do $$
declare
  out jsonb := '{}'::jsonb;
  v jsonb;
  markers jsonb := '{}'::jsonb;
  m record;
begin
  -- Which project this is (marker from 073_RUNBOOK.md), if it exists.
  if to_regprocedure('public.pinhunt_environment()') is not null then
    execute 'select to_jsonb(public.pinhunt_environment())' into v;
    out := out || jsonb_build_object('environment', v);
  else
    out := out || jsonb_build_object('environment', null);
  end if;
  out := out || jsonb_build_object('generated_at', now(), 'report_version', 1);

  -- Catalogue-relevant migrations, detected by an object each one creates.
  for m in
    select * from (values
      ('037', 'table', 'public.catalogue_sources'),
      ('038', 'column', 'pin_images.status'),
      ('042', 'constraint', 'pin_images_pin_and_pop_reference_only'),
      ('045', 'sequence', 'public.pinhunt_id_seq'),
      ('047', 'table', 'public.contributor_ai_usage'),
      ('052', 'table', 'public.catalogue_review_events'),
      ('053', 'column', 'pin_external_ids.match_status'),
      ('073', 'function', 'public.pinhunt_environment()'),
      ('075', 'table', 'public.board_scans'),
      ('076', 'table', 'public.bulk_image_batches')
    ) as t(migration, kind, name)
  loop
    markers := markers || jsonb_build_object(m.migration, case m.kind
      when 'table' then to_regclass(m.name) is not null
      when 'sequence' then to_regclass(m.name) is not null
      when 'function' then to_regprocedure(m.name) is not null
      when 'constraint' then exists (select 1 from pg_constraint where conname = m.name)
      when 'column' then exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = split_part(m.name, '.', 1)
          and column_name = split_part(m.name, '.', 2))
    end);
  end loop;
  out := out || jsonb_build_object('migration_markers', markers);

  -- Pins: totals and statuses (to_jsonb keeps this independent of columns).
  select jsonb_build_object(
    'total', count(*),
    'by_verification_status', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(to_jsonb(p)->>'verification_status', '(none)') k, count(*) n
        from public.pins p group by 1) s), '{}'),
    'by_catalogue_status', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(to_jsonb(p)->>'catalogue_status', '(none)') k, count(*) n
        from public.pins p group by 1) s), '{}'),
    'searchable', count(*) filter (where (to_jsonb(p)->>'is_searchable') = 'true'),
    'with_image_url', count(*) filter (where p.image_url is not null),
    'with_back_image_url', count(*) filter (where p.back_image_url is not null),
    'max_pinhunt_id', max(p.pinhunt_id),
    'last_created_at', max(p.created_at),
    'last_updated_at', max(p.updated_at)
  ) into v from public.pins p;
  out := out || jsonb_build_object('pins', v);

  -- Where pin photos are hosted: project ref + bucket, or "other".
  select coalesce(jsonb_object_agg(host, n), '{}') into v from (
    select coalesce(substring(u from '^https://([a-z0-9]{20})\.supabase\.co/storage/v1/object/public/[^/]+')
                    || ':' || substring(u from '^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/public/([^/]+)/'),
                    case when u ~ '^https?://' then 'other:' || substring(u from '^https?://([^/]+)') else 'relative_or_invalid' end) host,
           count(*) n
    from (select image_url u from public.pins where image_url is not null
          union all select back_image_url from public.pins where back_image_url is not null) x
    group by 1) s;
  out := out || jsonb_build_object('pin_image_hosts', v);

  -- pin_images by source / status / public display. Pin & Pop counted only.
  select coalesce(jsonb_agg(jsonb_build_object(
      'source', src, 'status', st, 'public_display_allowed', pda,
      'contributed', contributed, 'count', n) order by src, st), '[]') into v
  from (
    select coalesce(to_jsonb(i)->>'source', '(none)') src,
           coalesce(to_jsonb(i)->>'status', '(none)') st,
           to_jsonb(i)->>'public_display_allowed' pda,
           i.uploaded_by is not null contributed,
           count(*) n
    from public.pin_images i group by 1, 2, 3, 4) s;
  out := out || jsonb_build_object('pin_images', v);

  -- External id links by source (no ids listed).
  select coalesce(jsonb_object_agg(src, n), '{}') into v from (
    select coalesce(to_jsonb(e)->>'source', '(none)') src, count(*) n
    from public.pin_external_ids e group by 1) s;
  out := out || jsonb_build_object('pin_external_ids', v);

  -- Rights flags per catalogue source (no secrets here; these are policy rows).
  if to_regclass('public.catalogue_sources') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'public_display_allowed', to_jsonb(c)->'public_display_allowed',
        'storage_allowed', to_jsonb(c)->'storage_allowed',
        'app_use_allowed', to_jsonb(c)->'app_use_allowed',
        'attribution_required', to_jsonb(c)->'attribution_required',
        'exact_license_variant', to_jsonb(c)->'exact_license_variant',
        'rights_basis', to_jsonb(c)->'rights_basis',
        'updated_at', to_jsonb(c)->'updated_at') order by id), '[]')
      from public.catalogue_sources c $q$ into v;
    out := out || jsonb_build_object('catalogue_sources', v);
  end if;

  -- Other catalogue tables: row counts.
  select jsonb_build_object(
    'pin_sets', (select count(*) from public.pin_sets),
    'characters', (select count(*) from public.characters),
    'categories', (select count(*) from public.categories),
    'pin_set_memberships', (select count(*) from public.pin_set_memberships),
    'pin_characters', (select count(*) from public.pin_characters)
  ) into v;
  out := out || jsonb_build_object('catalogue_tables', v);

  -- Work queues: counts only (details are in query 5).
  select coalesce(jsonb_object_agg(status, n), '{}') into v from (
    select status, count(*) n from public.pin_submissions group by 1) s;
  out := out || jsonb_build_object('pin_submissions', v);

  if to_regclass('public.board_scans') is not null then
    execute $q$ select jsonb_build_object(
      'boards', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.board_scans group by 1) s),
      'items', (select count(*) from public.board_scan_items),
      'items_published', (select count(*) from public.board_scan_items where pin_image_id is not null)) $q$ into v;
    out := out || jsonb_build_object('board_scans', v);
  end if;

  if to_regclass('public.bulk_image_batches') is not null then
    execute $q$ select jsonb_build_object(
      'batches', (select count(*) from public.bulk_image_batches),
      'items', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.bulk_image_items group by 1) s),
      'items_published', (select count(*) from public.bulk_image_items where published_pin_image_id is not null)) $q$ into v;
    out := out || jsonb_build_object('bulk_images', v);
  end if;

  if to_regclass('public.catalogue_candidates') is not null then
    execute $q$ select coalesce(jsonb_object_agg(status, n), '{}')
      from (select status, count(*) n from public.catalogue_candidates group by 1) s $q$ into v;
    out := out || jsonb_build_object('catalogue_candidates', v);
  end if;

  -- Storage: files and bytes per bucket.
  select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', b.id, 'public', b.public,
      'objects', (select count(*) from storage.objects o where o.bucket_id = b.id),
      'bytes', (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = b.id))
    order by b.id), '[]') into v
  from storage.buckets b;
  out := out || jsonb_build_object('storage_buckets', v);

  perform set_config('pinhunt.gap_summary', out::text, false);
end $$;

select current_setting('pinhunt.gap_summary')::jsonb as summary;
