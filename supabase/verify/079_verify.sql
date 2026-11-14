-- ============================================================
-- Verification for migration 079 (run after applying 079, in the Supabase
-- SQL editor: staging first, then production). One transaction, rolled back:
-- the test rows it writes never persist.
-- Expected final output: a single row 'ALL 079 CHECKS PASSED'.
-- ============================================================

do $$
declare
  actual text;
begin
  if to_regprocedure('public.pinhunt_environment()') is null then
    raise exception 'Project guard: pinhunt_environment() is missing (073_RUNBOOK.md).';
  end if;
  execute 'select public.pinhunt_environment()' into actual;
  if actual not in ('staging', 'production') then
    raise exception 'Project guard: unexpected environment %.', actual;
  end if;
  raise notice '079 verify running on %', actual;
end $$;

begin;

-- Structure, RLS and grants.
do $$
begin
  if to_regclass('public.market_price_requests') is null then raise exception 'market_price_requests missing'; end if;
  if to_regprocedure('public.claim_market_price_request(uuid, uuid, text, text[], integer, integer, integer, integer, integer)') is null then
    raise exception 'claim_market_price_request missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.market_price_requests'::regclass) then
    raise exception 'RLS not enabled on market_price_requests';
  end if;
  if exists (select 1 from pg_policies where tablename = 'market_price_requests') then
    raise exception 'market_price_requests must have no policies (service role only)';
  end if;
  if has_table_privilege('authenticated', 'public.market_price_requests', 'select')
     or has_table_privilege('anon', 'public.market_price_requests', 'select') then
    raise exception 'client roles can read market_price_requests';
  end if;
  if has_function_privilege('authenticated', 'public.claim_market_price_request(uuid, uuid, text, text[], integer, integer, integer, integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.claim_market_price_request(uuid, uuid, text, text[], integer, integer, integer, integer, integer)', 'execute') then
    raise exception 'client roles can execute claim_market_price_request';
  end if;
  -- Prerequisites from 049/055.
  if to_regclass('public.market_valuations') is null or to_regclass('public.provider_budgets') is null then
    raise exception '049 not applied';
  end if;
  if to_regclass('public.market_valuation_history') is null then raise exception '055 not applied'; end if;
  if not exists (select 1 from information_schema.columns where table_name = 'market_listings' and column_name = 'location_filter') then
    raise exception '054 not applied';
  end if;
end $$;

-- Behaviour: in-flight, cache (including no_sales), caps. Needs one pin and
-- one auth user to exist; skipped with a notice otherwise.
do $$
declare
  v_pin   uuid := (select id from pins order by created_at limit 1);
  v_pin2  uuid := (select id from pins order by created_at offset 1 limit 1);
  v_user  uuid := (select id from auth.users order by created_at limit 1);
  r       record;
  src     text[] := array['soldgraph:ebay_gb_sold', 'soldgraph:ebay_us_sold'];
begin
  if v_pin is null or v_pin2 is null or v_user is null then
    raise notice 'Behaviour checks skipped: need two pins and one auth user.';
    return;
  end if;
  delete from market_price_requests where pin_id in (v_pin, v_pin2);

  -- 1. First claim succeeds.
  select * into r from claim_market_price_request(v_pin, v_user, 'user', src, 2, 2, 100, 30, 10);
  if r.decision <> 'claimed' or r.request_id is null then raise exception 'first claim: %', r.decision; end if;

  -- 2. A second claim for the same pin is in flight.
  select * into r from claim_market_price_request(v_pin, v_user, 'user', src, 2, 2, 100, 30, 10);
  if r.decision <> 'in_flight' then raise exception 'duplicate claim: %', r.decision; end if;

  -- 3. The unique index refuses a second pending row written directly.
  begin
    insert into market_price_requests (pin_id, origin, sources, worst_case_credits) values (v_pin, 'batch', src, 2);
    raise exception 'second pending row was accepted';
  exception when unique_violation then null;
  end;

  -- 4. Finish with no sales: the next claim is answered from the cache.
  update market_price_requests set status = 'complete', outcome = 'no_sales', finished_at = now(),
         sold_counts = '{"UK":0,"US":0}', credits_spent = 2
   where pin_id = v_pin and status = 'pending';
  select * into r from claim_market_price_request(v_pin, v_user, 'user', src, 2, 2, 100, 30, 10);
  if r.decision <> 'cached' or r.cached_outcome <> 'no_sales' then raise exception 'empty result not cached: %', r.decision; end if;
  -- A narrower request is covered too; a wider one is not.
  select * into r from claim_market_price_request(v_pin, v_user, 'user', array['soldgraph:ebay_gb_sold'], 1, 2, 100, 30, 10);
  if r.decision <> 'cached' then raise exception 'subset not cached: %', r.decision; end if;
  -- A cache window of 0 days means nothing is cached.
  select * into r from claim_market_price_request(v_pin, v_user, 'user', src, 2, 2, 100, 0, 10);
  if r.decision <> 'user_cap' and r.decision <> 'claimed' then raise exception 'zero-day cache: %', r.decision; end if;
  delete from market_price_requests where pin_id = v_pin and status = 'pending';

  -- 5. Per-user cap: limit 1, one request already today -> user_cap.
  select * into r from claim_market_price_request(v_pin2, v_user, 'user', src, 2, 1, 100, 30, 10);
  if r.decision <> 'user_cap' or r.retry_after is null then raise exception 'user cap: %', r.decision; end if;

  -- 6. Batch requests ignore the daily caps but still respect the cache and in-flight checks.
  select * into r from claim_market_price_request(v_pin2, null, 'batch', src, 2, 0, 0, 30, 10);
  if r.decision <> 'claimed' then raise exception 'batch claim: %', r.decision; end if;
  select * into r from claim_market_price_request(v_pin2, null, 'batch', src, 2, 0, 0, 30, 10);
  if r.decision <> 'in_flight' then raise exception 'batch duplicate: %', r.decision; end if;

  -- 7. Outcome/status consistency is enforced.
  begin
    update market_price_requests set status = 'complete' where pin_id = v_pin2 and status = 'pending';
    raise exception 'complete without outcome was accepted';
  exception when check_violation then null;
  end;
end $$;

rollback;

select 'ALL 079 CHECKS PASSED' as result;
