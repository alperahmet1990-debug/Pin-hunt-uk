-- Catalogue gap report, query 5 of 5: catalogue work in progress (READ-ONLY)
--
-- Run in EACH project's SQL editor (most of it only exists in staging).
-- Output: one row, one column `work` (JSON). Copy the cell into
--   <folder>/<staging|production>/5_work.json
--
-- Covers new-pin submissions, board scanning (075), the bulk image matcher
-- (076) and research candidates (045). Tables that don't exist are skipped.
-- No personal data: people columns, contributor names/handles, permission
-- evidence text and private file paths are left out (paths become yes/no).

set default_transaction_read_only = on;

do $$
declare
  out jsonb := '{}'::jsonb;
  v jsonb;
begin
  -- New-pin submissions (drafts counted only: they are unfinished personal work).
  select jsonb_build_object(
    'draft_count', (select count(*) from public.pin_submissions where status = 'draft'),
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'created_at', s.created_at,
        'updated_at', to_jsonb(s)->'updated_at',
        'has_front_photo', to_jsonb(s)->>'front_image_path' is not null,
        'has_back_photo', to_jsonb(s)->>'back_image_path' is not null,
        'approved_pin_id', to_jsonb(s)->'approved_pin_id',
        'approved_pinhunt_id', p.pinhunt_id,
        'proposed_name', to_jsonb(s)->'proposed_name',
        'series_name', to_jsonb(s)->'series_name',
        'release_year', to_jsonb(s)->'release_year',
        'rights_confirmed', to_jsonb(s)->>'rights_confirmed_at' is not null)
      order by s.created_at), '[]'))
  into v
  from public.pin_submissions s
  left join public.pins p on p.id = (to_jsonb(s)->>'approved_pin_id')::uuid
  where s.status <> 'draft';
  out := out || jsonb_build_object('pin_submissions', v);

  if to_regclass('public.board_scans') is not null then
    execute $q$
      select jsonb_build_object(
        'boards', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', b.id, 'status', b.status, 'mode', to_jsonb(b)->'mode', 'title', b.title,
            'permission_basis', b.permission_basis,
            'permission_public_display', b.permission_public_display,
            'not_third_party_catalogue', b.not_third_party_catalogue,
            'created_at', b.created_at, 'updated_at', b.updated_at,
            'stats', b.stats) order by b.created_at), '[]') from public.board_scans b),
        'items', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', i.id, 'board_scan_id', i.board_scan_id, 'position', i.position, 'origin', i.origin,
            'match_status', i.match_status, 'suggested_pinhunt_id', i.suggested_pin_id,
            'match_confidence', i.match_confidence, 'decision', i.decision,
            'decided_pinhunt_id', i.decided_pin_id, 'exclude_reason', i.exclude_reason,
            'cleanup_status', i.cleanup_status, 'has_crop', i.crop_path is not null,
            'has_cleaned_photo', i.cleaned_path is not null, 'image_review', i.image_review,
            'pin_image_id', i.pin_image_id, 'updated_at', to_jsonb(i)->'updated_at')
          order by i.board_scan_id, i.position), '[]') from public.board_scan_items i)) $q$
    into v;
    out := out || jsonb_build_object('board_scans', v);
  end if;

  if to_regclass('public.bulk_image_batches') is not null then
    execute $q$
      select jsonb_build_object(
        'batches', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', b.id, 'title', b.title, 'status', b.status, 'supplier_name', b.supplier_name,
            'permission_basis', b.permission_basis, 'licence', b.licence,
            'permission_public_display', b.permission_public_display,
            'created_at', b.created_at) order by b.created_at), '[]') from public.bulk_image_batches b),
        'items', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', i.id, 'batch_id', i.batch_id, 'status', i.status, 'failed_stage', i.failed_stage,
            'match_band', i.match_band, 'match_verified', i.match_verified,
            'matched_pinhunt_id', i.matched_pinhunt_id, 'match_method', i.match_method,
            'confirmed', i.confirmed_at is not null,
            'has_cleaned_photo', i.cleaned_path is not null,
            'published_pin_image_id', i.published_pin_image_id,
            'published_image_url', i.published_image_url,
            'replaced_image_url', i.replaced_image_url,
            'published_at', i.published_at, 'updated_at', i.updated_at)
          order by i.batch_id, i.created_at), '[]') from public.bulk_image_items i)) $q$
    into v;
    out := out || jsonb_build_object('bulk_images', v);
  end if;

  if to_regclass('public.catalogue_candidates') is not null then
    execute $q$
      select jsonb_build_object(
        'by_status', (select coalesce(jsonb_object_agg(status, n), '{}')
                        from (select status, count(*) n from public.catalogue_candidates group by 1) s),
        'runs', (select count(*) from public.catalogue_research_runs)) $q$
    into v;
    out := out || jsonb_build_object('catalogue_candidates', v);
  end if;

  perform set_config('pinhunt.gap_work', out::text, false);
end $$;

select current_setting('pinhunt.gap_work')::jsonb as work;
