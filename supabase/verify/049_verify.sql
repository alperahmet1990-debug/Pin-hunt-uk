-- ============================================================
-- Verification for migration 049 (run on STAGING after applying 049, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end: the test pin, test source, test
-- budgets, usage rows and listings leave nothing behind. Expected final
-- output: a single row 'ALL 049 CHECKS PASSED'. Any failed check aborts with
-- an error naming it.
-- ============================================================
begin;

-- 1. Shape, RLS and seed rows
do $$ begin
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
            and c.relname in ('market_sources', 'market_listings', 'market_valuations', 'provider_usage', 'provider_budgets')) = 5,
         '1a a 049 table is missing or has RLS off';
  assert (select count(*) from market_sources where id in (
            'soldgraph:ebay_gb_sold', 'soldgraph:ebay_fr_sold', 'soldgraph:ebay_us_sold', 'soldgraph:vinted_gb_active',
            'soldgraph:vinted_fr_active', 'soldgraph:whatnot_us_active', 'ebay_browse:ebay_gb_active')) = 7,
         '1b seed sources missing';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'market_listings' and (column_name ~ 'image|seller|photo|thumbnail')),
         '1c market_listings has an image or seller column';
end $$;

-- 2. Grants: clients cannot touch raw listings, usage or budgets; signed-in
--    users may only read sources and valuations; anon reads nothing.
do $$
declare t text; r text; p text;
begin
  foreach t in array array['market_listings', 'provider_usage', 'provider_budgets'] loop
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['select', 'insert', 'update', 'delete'] loop
        assert not has_table_privilege(r, 'public.' || t, p), format('2a %s has %s on %s', r, p, t);
      end loop;
    end loop;
    assert (select count(*) from pg_policies where schemaname = 'public' and tablename = t) = 0,
           format('2b %s has a policy', t);
  end loop;
  foreach t in array array['market_sources', 'market_valuations'] loop
    assert has_table_privilege('authenticated', 'public.' || t, 'select'), format('2c authenticated cannot read %s', t);
    assert not has_table_privilege('anon', 'public.' || t, 'select'), format('2d anon can read %s', t);
    foreach p in array array['insert', 'update', 'delete'] loop
      assert not has_table_privilege('authenticated', 'public.' || t, p), format('2e authenticated has %s on %s', p, t);
    end loop;
  end loop;
end $$;

-- 3. Functions: service role only
do $$
declare f text; r text;
begin
  foreach f in array array[
    'purge_market_listings(text, boolean)',
    'reserve_provider_credit(text, text, text, text, integer, uuid, timestamptz, integer, boolean)',
    'record_provider_usage(text, text, text, text, text, integer, text, uuid, timestamptz)',
    'get_provider_month_usage(text, text)'] loop
    foreach r in array array['anon', 'authenticated'] loop
      assert not has_function_privilege(r, 'public.' || f, 'execute'), format('3a %s can execute %s', r, f);
    end loop;
    assert has_function_privilege('service_role', 'public.' || f, 'execute'), format('3b service_role cannot execute %s', f);
  end loop;
end $$;

-- 4. v1 tables unchanged: marketplace CHECK and the read policies are still there
do $$ begin
  assert exists (select 1 from pg_constraint where conrelid = 'public.ebay_listing_snapshots'::regclass
                 and contype = 'c' and pg_get_constraintdef(oid) like '%EBAY_GB%'), '4a ebay_listing_snapshots CHECK missing';
  assert exists (select 1 from pg_constraint where conrelid = 'public.pin_market_estimates'::regclass
                 and contype = 'c' and pg_get_constraintdef(oid) like '%EBAY_GB%'), '4b pin_market_estimates CHECK missing';
  assert exists (select 1 from pg_policies where tablename = 'pin_market_estimates' and policyname = 'market estimates readable'),
         '4c pin_market_estimates policy missing';
  assert exists (select 1 from pg_policies where tablename = 'ebay_listing_snapshots' and policyname = 'listing snapshots readable'),
         '4d ebay_listing_snapshots policy missing';
end $$;

-- 5. Test data (rolled back)
insert into pins (pinhunt_id, title, brand, collection, verification_status)
values ('PHUK-VERIFY49A', 'Verify 049 pin', 'Disney', '', 'verified');
insert into market_sources (id, provider, marketplace, market, currency, evidence_type, retention_days)
values ('verify049:test_sold', 'verify049', 'ebay', 'UK', 'GBP', 'sold', 30);

-- 6. Listings: retention cap, constraints, purge
do $$
declare pid uuid; e timestamptz; n integer; ok boolean;
begin
  select id into pid from pins where pinhunt_id = 'PHUK-VERIFY49A';

  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, best_offer_accepted,
                               accepted, rejection_reason, parsed, last_seen_at)
  values ('verify049:test_sold', 'fresh', pid, 'Verify listing', 10, 'GBP', now(), 'sold', false, false, 'year_conflict',
          '{"year": 2019, "variant_terms": []}', now());
  select expires_at into e from market_listings where external_id = 'fresh' and source_id = 'verify049:test_sold';
  assert e between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', '6a expires_at not last_seen_at + 30 days';

  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at, expires_at)
  values ('verify049:test_sold', 'capped', pid, 'Verify listing', 10, 'GBP', now(), 'sold', now(), now() + interval '400 days');
  select expires_at into e from market_listings where external_id = 'capped' and source_id = 'verify049:test_sold';
  assert e <= now() + interval '30 days 1 hour', '6b expires_at not capped by retention_days';

  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at)
  values ('verify049:test_sold', 'old', pid, 'Verify listing', 10, 'GBP', now() - interval '40 days', 'sold', now() - interval '40 days');

  ok := false;
  begin
    insert into market_listings (source_id, external_id, pin_id, title, currency, price_kind, best_offer_accepted)
    values ('verify049:test_sold', 'bad-offer', pid, 'x', 'GBP', 'active', true);
  exception when check_violation then ok := true;
  end;
  assert ok, '6c best_offer_accepted allowed on an active listing';

  ok := false;
  begin
    insert into market_listings (source_id, external_id, pin_id, title, currency, price_kind, accepted, rejection_reason)
    values ('verify049:test_sold', 'bad-accept', pid, 'x', 'GBP', 'active', true, 'low_score');
  exception when check_violation then ok := true;
  end;
  assert ok, '6d accepted listing with a rejection_reason allowed';

  ok := false;
  begin
    insert into market_listings (source_id, external_id, pin_id, title, currency, price_kind)
    values ('verify049:test_sold', 'fresh', pid, 'dup', 'GBP', 'active');
  exception when unique_violation then ok := true;
  end;
  assert ok, '6e duplicate (source_id, external_id, pin_id) allowed';

  n := purge_market_listings('verify049:test_sold');
  assert n = 1, '6f purge of expired rows removed ' || n || ' rows, expected 1';
  assert not exists (select 1 from market_listings where source_id = 'verify049:test_sold' and external_id = 'old'), '6g old row kept';

  -- Shortening retention takes effect on the next purge.
  update market_sources set retention_days = 1 where id = 'verify049:test_sold';
  update market_listings set last_seen_at = now() - interval '2 days', expires_at = now() + interval '1 day'
  where source_id = 'verify049:test_sold' and external_id = 'capped';
  n := purge_market_listings('verify049:test_sold');
  assert n = 1, '6h shortened retention not honoured (' || n || ')';

  n := purge_market_listings('verify049:test_sold', true);
  assert n = 1, '6i purge-all removed ' || n || ' rows, expected 1';
  assert not exists (select 1 from market_listings where source_id = 'verify049:test_sold'), '6j rows left after purge-all';

  ok := false;
  begin
    perform purge_market_listings(null, true);
  exception when invalid_parameter_value then ok := true;
  end;
  assert ok, '6k purge-all without a source allowed';
end $$;

-- 7. Valuations: only derived fields in sources, ordered prices
do $$
declare pid uuid; ok boolean;
begin
  select id into pid from pins where pinhunt_id = 'PHUK-VERIFY49A';
  insert into market_valuations (pin_id, market, currency, low, fair, high, sold_count, confidence_score, confidence_band,
                                 sources, method_version, expires_at)
  values (pid, 'UK', 'GBP', 8, 10, 12, 5, 60, 'medium',
          '[{"source_id": "soldgraph:ebay_gb_sold", "count": 5, "latest_date": "2026-10-01"}]', 'v-test', now() + interval '7 days');

  ok := false;
  begin
    insert into market_valuations (pin_id, market, currency, confidence_band, sources, method_version, expires_at)
    values (pid, 'FR', 'EUR', 'low', '[{"source_id": "x:y", "count": 1, "listing_url": "https://example.com"}]', 'v', now());
  exception when check_violation then ok := true;
  end;
  assert ok, '7a listing detail accepted in market_valuations.sources';

  ok := false;
  begin
    insert into market_valuations (pin_id, market, currency, low, fair, high, confidence_band, method_version, expires_at)
    values (pid, 'US', 'USD', 20, 10, 30, 'low', 'v', now());
  exception when check_violation then ok := true;
  end;
  assert ok, '7b low > fair accepted';
end $$;

-- 8. Budget reservation and settlement
insert into provider_budgets (provider, month, limit_credits, hard_stop) values ('verify049', '2026-10', 2, true);
do $$
declare r record; u record;
begin
  select * into r from reserve_provider_credit('verify049', '2026-10', 'r', 'k1', 1, null, now(), 100, true);
  assert r.allowed and r.used_credits = 0 and r.limit_credits = 2, '8a first reservation';
  select * into r from reserve_provider_credit('verify049', '2026-10', 'r', 'k2', 1, null, now(), 100, true);
  assert r.allowed and r.used_credits = 1, '8b second reservation';
  select * into r from reserve_provider_credit('verify049', '2026-10', 'r', 'k3', 1, null, now(), 100, true);
  assert not r.allowed and r.used_credits = 2, '8c reservation over the cap allowed';
  select * into r from reserve_provider_credit('verify049', '2026-10', 'r', 'k1', 1, null, now(), 100, true);
  assert r.allowed, '8d repeated idempotency key refused';
  assert (select count(*) from provider_usage where provider = 'verify049') = 2, '8e unexpected usage rows';

  -- A failed job settles to 0 credits and frees the slot.
  perform record_provider_usage('verify049', '2026-10', 'r', 'k2', 'failed', 0, 'req-2', null, now());
  select * into u from get_provider_month_usage('verify049', '2026-10');
  assert u.credits = 1 and u.requests = 2, '8f settle did not apply';
  -- A settled row is not changed again.
  perform record_provider_usage('verify049', '2026-10', 'r', 'k2', 'complete', 1, null, null, now());
  select * into u from get_provider_month_usage('verify049', '2026-10');
  assert u.credits = 1, '8g settled row was changed';
  -- An unreserved call is logged.
  perform record_provider_usage('verify049', '2026-10', 'r', 'k4', 'complete', 1, null, null, now());
  select * into u from get_provider_month_usage('verify049', '2026-10');
  assert u.credits = 2 and u.requests = 3, '8h unreserved call not logged';

  -- No budget row: the caller's default applies.
  select * into r from reserve_provider_credit('verify049b', '2026-10', 'r', 'a', 1, null, now(), 1, true);
  assert r.allowed and r.limit_credits = 1, '8i default budget not applied';
  select * into r from reserve_provider_credit('verify049b', '2026-10', 'r', 'b', 1, null, now(), 1, true);
  assert not r.allowed, '8j default budget not enforced';
end $$;

-- 9. As a signed-in client: raw tables are unreadable, valuations readable
set local role authenticated;
do $$
declare t text; ok boolean;
begin
  foreach t in array array['market_listings', 'provider_usage', 'provider_budgets'] loop
    ok := false;
    begin
      execute format('select count(*) from public.%I', t);
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, format('9a authenticated can read %s', t);
  end loop;
  assert (select count(*) from market_valuations where method_version = 'v-test') = 1,
         '9b authenticated cannot read market_valuations';
  ok := false;
  begin
    perform reserve_provider_credit('verify049', '2026-10', 'r', 'k9', 1, null, now(), 100, true);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '9c authenticated can reserve credits';
end $$;
reset role;

set local role anon;
do $$
declare t text; ok boolean;
begin
  foreach t in array array['market_listings', 'provider_usage', 'provider_budgets', 'market_valuations', 'market_sources'] loop
    ok := false;
    begin
      execute format('select count(*) from public.%I', t);
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, format('9d anon can read %s', t);
  end loop;
end $$;
reset role;

select 'ALL 049 CHECKS PASSED' as result;
rollback;
