-- ============================================================
-- Verification for migration 076 (run on STAGING after applying 076, in the
-- Supabase SQL editor). Read-only checks, one transaction, rolled back.
-- Expected final output: a single row 'ALL 076 CHECKS PASSED'.
-- ============================================================

-- Project guard (see 073_RUNBOOK.md). This migration is staging-only for now.
do $$
declare
  actual text;
begin
  if to_regprocedure('public.pinhunt_environment()') is null then
    raise exception 'Project guard: pinhunt_environment() is missing (073_RUNBOOK.md).';
  end if;
  execute 'select public.pinhunt_environment()' into actual;
  if actual is distinct from 'staging' then
    raise exception 'Project guard: this is %, not staging.', actual;
  end if;
end $$;

begin;

do $$
begin
  if to_regclass('public.bulk_image_batches') is null then raise exception 'bulk_image_batches missing'; end if;
  if to_regclass('public.bulk_image_items') is null then raise exception 'bulk_image_items missing'; end if;

  if not (select relrowsecurity from pg_class where oid = 'public.bulk_image_batches'::regclass) then
    raise exception 'RLS not enabled on bulk_image_batches';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.bulk_image_items'::regclass) then
    raise exception 'RLS not enabled on bulk_image_items';
  end if;

  -- Only the admin read policies; no client write policies.
  if exists (select 1 from pg_policies where tablename in ('bulk_image_batches', 'bulk_image_items')
             and cmd <> 'SELECT') then
    raise exception 'Unexpected non-select policy on bulk image tables';
  end if;

  if not exists (select 1 from storage.buckets where id = 'bulk-image-matcher' and public = false) then
    raise exception 'bulk-image-matcher bucket missing or public';
  end if;

  if not exists (select 1 from catalogue_sources where id = 'pinhunt_bulk_upload' and public_display_allowed) then
    raise exception 'catalogue_sources pinhunt_bulk_upload missing';
  end if;

  -- 042 guard still in place (Pin & Pop rows stay reference-only).
  if not exists (select 1 from pg_constraint where conname = 'pin_images_pin_and_pop_reference_only') then
    raise exception '042 constraint pin_images_pin_and_pop_reference_only missing';
  end if;
end $$;

-- Anonymous / plain collector sessions see nothing.
set local role anon;
do $$
begin
  if exists (select 1 from bulk_image_batches) or exists (select 1 from bulk_image_items) then
    raise exception 'anon can read bulk image tables';
  end if;
end $$;
reset role;

select 'ALL 076 CHECKS PASSED' as result;

rollback;
