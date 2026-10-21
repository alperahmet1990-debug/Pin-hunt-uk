-- ============================================================
-- Verification for migration 055 (run on STAGING after applying 055, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end: the test pins, test sources,
-- listings, valuations and history rows leave nothing behind. Expected
-- output: one informational row set (retention per source), then a single
-- row 'ALL 055 CHECKS PASSED'. Any failed check aborts with an error naming
-- it.
-- ============================================================
begin;

-- 1. Shape
do $$ begin
  assert (select is_nullable = 'YES' from information_schema.columns
          where table_schema = 'public' and table_name = 'market_sources' and column_name = 'retention_days'),
         '1a market_sources.retention_days is still NOT NULL';
  assert (select is_nullable = 'YES' from information_schema.columns
          where table_schema = 'public' and table_name = 'market_listings' and column_name = 'expires_at'),
         '1b market_listings.expires_at is still NOT NULL';
  assert exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'market_valuations' and column_name = 'source_summaries'
                 and data_type = 'jsonb' and is_nullable = 'NO'),
         '1c market_valuations.source_summaries missing';
  assert (select relrowsecurity from pg_class where oid = 'public.market_valuation_history'::regclass),
         '1d market_valuation_history missing or RLS off';
  assert exists (select 1 from pg_constraint c join pg_class t on t.oid = c.confrelid
                 where c.conrelid = 'public.market_valuation_history'::regclass and c.contype = 'f'
                   and t.relname = 'pins' and c.confdeltype = 'c'),
         '1e market_valuation_history.pin_id is not an on-delete-cascade FK to pins';
  -- Still no image, seller or location-text column on listings.
  assert not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name in ('market_listings', 'market_valuation_history')
                     and (column_name ~ 'image|seller|photo|thumbnail|location_text|town|title|url')
                     and not (table_name = 'market_listings' and column_name in ('title', 'listing_url'))),
         '1f an image, seller, title, link or location-text column was added';
end $$;

-- 2. Seed sources: Soldgraph has no age limit, eBay Browse keeps its value
do $$ begin
  assert not exists (select 1 from market_sources where provider = 'soldgraph' and retention_days is not null),
         '2a a Soldgraph source still has retention_days';
  assert (select retention_days is not null from market_sources where id = 'ebay_browse:ebay_gb_active'),
         '2b ebay_browse:ebay_gb_active lost its retention_days';
  assert not exists (select 1 from market_listings l join market_sources s on s.id = l.source_id
                     where s.retention_days is null and l.expires_at is not null),
         '2c a listing of a no-limit source still has expires_at';
end $$;

-- Informational (read only): retention per source after 055.
select id, provider, retention_days from market_sources order by id;

-- 3. Access: history is service role only; 049 grants unchanged
do $$
declare r text; p text;
begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'market_valuation_history') = 0,
         '3a market_valuation_history has a policy';
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      assert not has_table_privilege(r, 'public.market_valuation_history', p), format('3b %s has %s on market_valuation_history', r, p);
      assert not has_table_privilege(r, 'public.market_listings', p), format('3c %s has %s on market_listings', r, p);
    end loop;
    assert not has_function_privilege(r, 'public.purge_market_listings(text, boolean)', 'execute'),
           format('3d %s can execute purge_market_listings', r);
  end loop;
  assert has_table_privilege('service_role', 'public.market_valuation_history', 'insert'), '3e service_role cannot insert history';
  assert has_table_privilege('service_role', 'public.market_valuation_history', 'select'), '3f service_role cannot read history';
  assert has_function_privilege('service_role', 'public.purge_market_listings(text, boolean)', 'execute'),
         '3g service_role cannot execute purge_market_listings';
  assert has_table_privilege('authenticated', 'public.market_valuations', 'select'), '3h market_valuations read changed';
  assert not has_table_privilege('anon', 'public.market_valuations', 'select'), '3i anon can read market_valuations';
end $$;

-- 4. Test data (rolled back)
insert into pins (pinhunt_id, title, brand, collection, verification_status)
values ('PHUK-VERIFY55A', 'Verify 055 pin', 'Disney', '', 'verified'),
       ('PHUK-VERIFY55B', 'Verify 055 pin B', 'Disney', '', 'verified');
insert into market_sources (id, provider, marketplace, market, currency, evidence_type, retention_days) values
  ('verify055:keep_sold',    'verify055', 'ebay', 'UK', 'GBP', 'sold',   null),
  ('verify055:limited_sold', 'verify055', 'ebay', 'UK', 'GBP', 'sold',   30);

-- 5. Retention CHECK still applies to non-NULL values
do $$
declare ok boolean;
begin
  ok := false;
  begin
    update market_sources set retention_days = 0 where id = 'verify055:limited_sold';
  exception when check_violation then ok := true;
  end;
  assert ok, '5a retention_days = 0 accepted';
  ok := false;
  begin
    update market_sources set retention_days = 366 where id = 'verify055:limited_sold';
  exception when check_violation then ok := true;
  end;
  assert ok, '5b retention_days = 366 accepted';
end $$;

-- 6. Expiry trigger and purge
do $$
declare pid uuid; e timestamptz; n integer;
begin
  select id into pid from pins where pinhunt_id = 'PHUK-VERIFY55A';

  -- No-limit source: expires_at is always NULL, even if the writer sends one.
  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at, expires_at)
  values ('verify055:keep_sold', 'keep-old', pid, 'Verify listing', 10, 'GBP', now() - interval '400 days', 'sold',
          now() - interval '400 days', now() - interval '1 day');
  select expires_at into e from market_listings where source_id = 'verify055:keep_sold' and external_id = 'keep-old';
  assert e is null, '6a expires_at set for a no-limit source';
  update market_listings set last_seen_at = now() - interval '399 days'
  where source_id = 'verify055:keep_sold' and external_id = 'keep-old';
  select expires_at into e from market_listings where source_id = 'verify055:keep_sold' and external_id = 'keep-old';
  assert e is null, '6b expires_at set on update for a no-limit source';

  -- Limited source: 049 behaviour unchanged.
  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at)
  values ('verify055:limited_sold', 'fresh', pid, 'Verify listing', 10, 'GBP', now(), 'sold', now());
  select expires_at into e from market_listings where source_id = 'verify055:limited_sold' and external_id = 'fresh';
  assert e between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', '6c limited source expiry changed';
  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at, expires_at)
  values ('verify055:limited_sold', 'capped', pid, 'Verify listing', 10, 'GBP', now(), 'sold', now(), now() + interval '400 days');
  select expires_at into e from market_listings where source_id = 'verify055:limited_sold' and external_id = 'capped';
  assert e <= now() + interval '30 days 1 hour', '6d limited source expiry not capped';
  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at)
  values ('verify055:limited_sold', 'old', pid, 'Verify listing', 10, 'GBP', now() - interval '40 days', 'sold', now() - interval '40 days');

  -- Age-based purge, all sources: removes only the limited source's old row.
  n := purge_market_listings();
  assert not exists (select 1 from market_listings where source_id = 'verify055:limited_sold' and external_id = 'old'),
         '6e expired row of a limited source kept';
  assert exists (select 1 from market_listings where source_id = 'verify055:keep_sold' and external_id = 'keep-old'),
         '6f age-based purge deleted a row of a no-limit source';

  -- Age-based purge, named no-limit source: deletes nothing.
  n := purge_market_listings('verify055:keep_sold');
  assert n = 0, '6g age-based purge of a no-limit source removed ' || n || ' rows';

  -- Explicit purge-all of that source: deletes everything of it, nothing else.
  n := purge_market_listings('verify055:keep_sold', true);
  assert n = 1, '6h purge-all removed ' || n || ' rows, expected 1';
  assert (select count(*) from market_listings where source_id = 'verify055:limited_sold') = 2,
         '6i purge-all touched another source';

  -- Switching a source from no limit to a limit takes effect at the next purge.
  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at)
  values ('verify055:keep_sold', 'later', pid, 'Verify listing', 10, 'GBP', now() - interval '50 days', 'sold', now() - interval '50 days');
  update market_sources set retention_days = 30 where id = 'verify055:keep_sold';
  n := purge_market_listings('verify055:keep_sold');
  assert n = 1, '6j a newly set limit was not honoured (' || n || ')';
end $$;

-- 7. source_summaries: allowed keys only
do $$
declare pid uuid; ok boolean;
begin
  select id into pid from pins where pinhunt_id = 'PHUK-VERIFY55A';
  insert into market_valuations (pin_id, market, currency, low, fair, high, sold_count, confidence_score, confidence_band,
                                 sources, source_summaries, method_version, expires_at)
  values (pid, 'UK', 'GBP', 8, 10, 12, 5, 60, 'medium',
          '[{"source_id": "soldgraph:ebay_gb_sold", "count": 5, "latest_date": "2026-10-01"}]',
          '[{"source_id": "soldgraph:ebay_gb_sold", "provider": "soldgraph", "evidence_type": "sold", "count": 5, "latest_date": "2026-10-01", "median": 10},
            {"source_id": "ebay_browse:ebay_gb_active", "provider": "ebay_browse", "evidence_type": "active", "count": 3, "low": 9, "high": 14, "median": 11}]',
          'v-test', now() + interval '7 days');

  ok := false;
  begin
    update market_valuations set source_summaries = '[{"source_id": "x:y", "count": 1, "listing_url": "https://example.com"}]'
    where pin_id = pid and market = 'UK';
  exception when check_violation then ok := true;
  end;
  assert ok, '7a listing detail accepted in market_valuations.source_summaries';

  ok := false;
  begin
    update market_valuations set source_summaries = '[{"source_id": "x:y", "evidence_type": "other"}]'
    where pin_id = pid and market = 'UK';
  exception when check_violation then ok := true;
  end;
  assert ok, '7b unknown evidence_type accepted';

  assert (select jsonb_array_length(source_summaries) from market_valuations where pin_id = pid and market = 'UK') = 2,
         '7c source_summaries not stored';
end $$;

-- 8. History: append-only, restricted shapes, cascade with the pin
do $$
declare pid uuid; pid_b uuid; ok boolean; c timestamptz;
begin
  select id into pid from pins where pinhunt_id = 'PHUK-VERIFY55A';
  select id into pid_b from pins where pinhunt_id = 'PHUK-VERIFY55B';

  insert into market_valuation_history (pin_id, market, currency, low, fair, high, sold_count, confidence_score, confidence_band,
                                        sources, source_summaries, method_version, calculated_at, created_at)
  values (pid, 'UK', 'GBP', 8, 10, 12, 5, 60, 'medium',
          '[{"source_id": "soldgraph:ebay_gb_sold", "count": 5, "latest_date": "2026-10-01"}]',
          '[{"source_id": "soldgraph:ebay_gb_sold", "provider": "soldgraph", "evidence_type": "sold", "count": 5, "median": 10}]',
          'v-test', now() - interval '1 hour', '2000-01-01');
  insert into market_valuation_history (pin_id, market, currency, confidence_band, method_version, calculated_at)
  values (pid, 'UK', 'GBP', 'insufficient', 'v-test', now());
  insert into market_valuation_history (pin_id, market, currency, confidence_band, method_version, calculated_at)
  values (pid_b, 'FR', 'EUR', 'insufficient', 'v-test', now());
  assert (select count(*) from market_valuation_history where pin_id = pid) = 2, '8a history rows not appended';
  select min(created_at) into c from market_valuation_history where pin_id = pid;
  assert c > now() - interval '1 minute', '8b created_at not forced to the insert time';

  ok := false;
  begin
    update market_valuation_history set fair = 99 where pin_id = pid;
  exception when raise_exception then ok := true;
  end;
  assert ok, '8c history update allowed';

  ok := false;
  begin
    delete from market_valuation_history where pin_id = pid;
  exception when raise_exception then ok := true;
  end;
  assert ok, '8d history delete allowed';

  ok := false;
  begin
    truncate market_valuation_history;
  exception when raise_exception then ok := true;
  end;
  assert ok, '8e history truncate allowed';

  ok := false;
  begin
    insert into market_valuation_history (pin_id, market, currency, confidence_band, sources, method_version, calculated_at)
    values (pid, 'UK', 'GBP', 'low', '[{"source_id": "x:y", "count": 1, "title": "x"}]', 'v', now());
  exception when check_violation then ok := true;
  end;
  assert ok, '8f listing detail accepted in history sources';

  ok := false;
  begin
    insert into market_valuation_history (pin_id, market, currency, low, fair, high, confidence_band, method_version, calculated_at)
    values (pid, 'UK', 'GBP', 20, 10, 30, 'low', 'v', now());
  exception when check_violation then ok := true;
  end;
  assert ok, '8g history low > fair accepted';

  -- Deleting the pin removes its history (same cascade as market_valuations)
  -- and leaves other pins' history alone.
  delete from pins where id = pid;
  assert not exists (select 1 from market_valuation_history where pin_id = pid), '8h history kept after pin delete';
  assert not exists (select 1 from market_valuations where pin_id = pid), '8i valuation kept after pin delete';
  assert (select count(*) from market_valuation_history where pin_id = pid_b) = 1, '8j another pin''s history removed';
end $$;

-- 9. As a signed-in client and as anon: history is unreadable
set local role authenticated;
do $$
declare ok boolean := false;
begin
  begin
    perform count(*) from public.market_valuation_history;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '9a authenticated can read market_valuation_history';
end $$;
reset role;
set local role anon;
do $$
declare ok boolean := false;
begin
  begin
    perform count(*) from public.market_valuation_history;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '9b anon can read market_valuation_history';
end $$;
reset role;

select 'ALL 055 CHECKS PASSED' as result;

rollback;
