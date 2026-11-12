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

  -- Migrations 037 onwards, each detected by an object it creates. Five
  -- migrations only rewrite existing functions or grants (056, 061, 063, 064,
  -- 074) and can't be detected this way: use their supabase/verify scripts.
  for m in
    select * from (values
      ('037', 'table', 'catalogue_sources'),
      ('038', 'column', 'pin_images.status'),
      ('039', 'table', 'feature_flags'),
      ('040', 'function', 'is_app_creator'),
      ('041', 'policy', 'pins.pins_app_creator_insert'),
      ('042', 'constraint', 'pin_images_pin_and_pop_reference_only'),
      ('043', 'table', 'user_boards'),
      ('044', 'function', 'set_user_pin_statuses'),
      ('045', 'function', 'next_pinhunt_id'),
      ('047', 'table', 'contributor_ai_usage'),
      ('048', 'function', 'get_catalogue_image_coverage'),
      ('049', 'table', 'market_sources'),
      ('050', 'table', 'user_blocks'),
      ('051', 'table', 'account_deletions'),
      ('052', 'table', 'catalogue_review_events'),
      ('053', 'column', 'pin_external_ids.match_status'),
      ('054', 'column', 'market_listings.site'),
      ('055', 'table', 'market_valuation_history'),
      ('057', 'column', 'trades.initiator_posted_at'),
      ('058', 'constraint', 'trade_ratings_comment_length'),
      ('059', 'column', 'trades.problem_reason'),
      ('060', 'function', 'link_conversation_trade'),
      ('062', 'function', 'get_my_postcode'),
      ('065', 'table', 'collector_pin_prices'),
      ('066', 'function', 'collector_contact_preferences'),
      ('067', 'table', 'collection_places'),
      ('068', 'column', 'profiles.home_market'),
      ('069', 'column', 'contributor_ai_usage.outcome'),
      ('070', 'column', 'trades.items_version'),
      ('071', 'function', 'trade_post_event'),
      ('072', 'table', 'message_moderation_events'),
      ('073', 'function', 'pinhunt_minimum_age'),
      ('075', 'table', 'board_scans'),
      ('076', 'table', 'bulk_image_batches')
    ) as t(migration, kind, name)
  loop
    markers := markers || jsonb_build_object(m.migration, case m.kind
      when 'table' then to_regclass('public.' || m.name) is not null
      when 'function' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = m.name)
      when 'constraint' then exists (select 1 from pg_constraint where conname = m.name)
      when 'policy' then exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = split_part(m.name, '.', 1)
          and policyname = split_part(m.name, '.', 2))
      when 'column' then exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = split_part(m.name, '.', 1)
          and column_name = split_part(m.name, '.', 2))
    end);
  end loop;
  -- 073's project marker, which later migrations' guards rely on.
  markers := markers || jsonb_build_object('073_marker', to_regprocedure('public.pinhunt_environment()') is not null);
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
