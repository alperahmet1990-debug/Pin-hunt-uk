-- ============================================================
-- Verification for migration 087 (run after applying 087, in the Supabase
-- SQL editor: staging first, then production). One transaction, rolled back:
-- the test calls it makes never persist.
-- Expected final output: a single row 'ALL 087 CHECKS PASSED'.
-- ============================================================

begin;

do $$
declare
  r record;
  b uuid;
  merged jsonb;
begin
  if to_regclass('public.bulk_ai_usage') is null then raise exception 'bulk_ai_usage missing'; end if;
  if to_regprocedure('public.bulk_reserve_ai_calls(integer, integer)') is null then raise exception 'bulk_reserve_ai_calls missing'; end if;
  if to_regprocedure('public.bulk_merge_batch_stats(uuid, jsonb)') is null then raise exception 'bulk_merge_batch_stats missing'; end if;

  -- Service role only.
  if not (select relrowsecurity from pg_class where oid = 'public.bulk_ai_usage'::regclass) then
    raise exception 'RLS not enabled on bulk_ai_usage';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bulk_ai_usage') then
    raise exception 'bulk_ai_usage must have no policies';
  end if;
  if has_function_privilege('anon', 'public.bulk_reserve_ai_calls(integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.bulk_reserve_ai_calls(integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.bulk_merge_batch_stats(uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.bulk_merge_batch_stats(uuid, jsonb)', 'execute') then
    raise exception 'client roles can call the 087 functions';
  end if;

  -- The budget: allowed within the limit, refused past it, nothing added when refused.
  delete from bulk_ai_usage where usage_day = (now() at time zone 'utc')::date;
  select * into r from bulk_reserve_ai_calls(3, 5);
  if not r.allowed or r.used <> 3 then raise exception 'first reservation should be allowed (got %, %)', r.allowed, r.used; end if;
  select * into r from bulk_reserve_ai_calls(3, 5);
  if r.allowed or r.used <> 3 then raise exception 'reservation past the limit should be refused (got %, %)', r.allowed, r.used; end if;
  select * into r from bulk_reserve_ai_calls(2, 5);
  if not r.allowed or r.used <> 5 then raise exception 'reservation up to the limit should be allowed (got %, %)', r.allowed, r.used; end if;

  -- The merge keeps other keys.
  if exists (select 1 from information_schema.columns where table_name = 'bulk_image_batches' and column_name = 'stats') then
    insert into bulk_image_batches (title, supplier_name, permission_basis, stats)
    values ('087 verify', 'verify', 'own_photos', '{"setHints": ["A set"]}') returning id into b;
    merged := bulk_merge_batch_stats(b, '{"accuracy": {"checked": 1}}');
    if merged -> 'setHints' is null or merged -> 'accuracy' is null then
      raise exception 'merge lost a key: %', merged;
    end if;
  else
    raise exception 'bulk_image_batches.stats missing: apply 086 first';
  end if;
end $$;

rollback;

select 'ALL 087 CHECKS PASSED' as result;
