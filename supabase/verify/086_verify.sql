-- ============================================================
-- Verification for migration 086 (run after applying 086, in the Supabase
-- SQL editor: staging first, then production). Read-only checks.
-- Expected final output: a single row 'ALL 086 CHECKS PASSED'.
-- ============================================================

do $$
declare
  col record;
begin
  if to_regclass('public.bulk_image_batches') is null then
    raise exception 'bulk_image_batches missing: apply 076 first';
  end if;
  select data_type, is_nullable, column_default into col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bulk_image_batches' and column_name = 'stats';
  if not found then raise exception 'bulk_image_batches.stats missing'; end if;
  if col.data_type <> 'jsonb' then raise exception 'stats should be jsonb, is %', col.data_type; end if;
  if col.is_nullable <> 'NO' then raise exception 'stats should be not null'; end if;
  if col.column_default is null or col.column_default not like '''{}''%' then
    raise exception 'stats default should be {}, is %', col.column_default;
  end if;
  if exists (select 1 from public.bulk_image_batches where stats is null) then
    raise exception 'a batch has null stats';
  end if;
  -- RLS unchanged from 076: still on, with only the admin read policy.
  if not (select relrowsecurity from pg_class where oid = 'public.bulk_image_batches'::regclass) then
    raise exception 'RLS not enabled on bulk_image_batches';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'bulk_image_batches') <> 1 then
    raise exception 'bulk_image_batches should still have just its admin read policy (076)';
  end if;
end $$;

-- Ask the API to see the new column.
notify pgrst, 'reload schema';

select 'ALL 086 CHECKS PASSED' as result;
