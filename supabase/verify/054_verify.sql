-- ============================================================
-- Verification for migration 054 (run on STAGING after applying 054, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end: the test pin, test source and
-- test listings leave nothing behind. Expected output: two informational
-- rows (existing evidence by region state, and items stored under more than
-- one eBay sold source), then a single row 'ALL 054 CHECKS PASSED'. Any
-- failed check aborts with an error naming it.
-- ============================================================
begin;

-- 1. Shape: five nullable columns with the expected types
do $$
declare c record;
begin
  for c in select * from (values
      ('site', 'text'), ('location_filter', 'text'), ('item_country', 'text'),
      ('displayed_currency', 'text'), ('price_is_converted', 'boolean')) as t(name, type) loop
    assert exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'market_listings'
                     and column_name = c.name and data_type = c.type and is_nullable = 'YES'),
           format('1a market_listings.%s missing, wrong type or NOT NULL', c.name);
  end loop;
  assert (select count(*) from pg_constraint where conrelid = 'public.market_listings'::regclass and conname in (
            'market_listing_site_check', 'market_listing_location_filter_check', 'market_listing_item_country_check',
            'market_listing_displayed_currency_check')) = 4,
         '1b a 054 CHECK constraint is missing';
  -- 049's rule still holds: no image, seller, photo or location-text column.
  assert not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'market_listings' and (column_name ~ 'image|seller|photo|thumbnail|location_text|town')),
         '1c market_listings has an image, seller or location-text column';
end $$;

-- 2. Access unchanged: RLS on, no policies, no client privileges
do $$
declare r text; p text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.market_listings'::regclass), '2a RLS is off on market_listings';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'market_listings') = 0,
         '2b market_listings has a policy';
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      assert not has_table_privilege(r, 'public.market_listings', p), format('2c %s has %s on market_listings', r, p);
    end loop;
    assert not has_column_privilege(r, 'public.market_listings', 'item_country', 'select'),
           format('2d %s can read market_listings.item_country', r);
  end loop;
  assert has_table_privilege('service_role', 'public.market_listings', 'insert'), '2e service_role cannot write market_listings';
end $$;

-- 3. Informational (read only): existing evidence by region state. Rows with
--    location_filter NULL (everything stored before 054) are "region
--    unverified" and no longer count towards regional valuations.
select l.source_id,
       count(*) filter (where l.location_filter is null)           as region_unverified,
       count(*) filter (where l.location_filter = 'domestic')      as domestic,
       count(*) filter (where l.location_filter = 'worldwide')     as worldwide
from market_listings l
where l.source_id like 'soldgraph:ebay\_%\_sold'
group by l.source_id
order by l.source_id;

-- 4. Informational (read only): eBay items stored under more than one eBay
--    sold source for the same pin (the #411 pilot found 55 across 14 pins).
select count(distinct (l.pin_id, l.external_id)) as items_under_several_sources,
       count(distinct l.pin_id)                  as pins
from market_listings l
where l.source_id like 'soldgraph:ebay\_%\_sold'
  and exists (select 1 from market_listings o
              where o.pin_id = l.pin_id and o.external_id = l.external_id
                and o.source_id like 'soldgraph:ebay\_%\_sold' and o.source_id <> l.source_id);

-- 5. Test data (rolled back)
insert into pins (pinhunt_id, title, brand, collection, verification_status)
values ('PHUK-VERIFY54A', 'Verify 054 pin', 'Disney', '', 'verified');
insert into market_sources (id, provider, marketplace, market, currency, evidence_type, retention_days)
values ('verify054:test_sold', 'verify054', 'ebay', 'UK', 'GBP', 'sold', 30);

-- 6. Constraints accept good values and NULLs, and reject anything else
do $$
declare pid uuid; ok boolean; bad record;
begin
  select id into pid from pins where pinhunt_id = 'PHUK-VERIFY54A';

  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at,
                               site, location_filter, item_country, displayed_currency, price_is_converted)
  values ('verify054:test_sold', 'good', pid, 'Verify listing', 10, 'GBP', now(), 'sold', now(),
          'uk', 'domestic', 'GB', 'GBP', null);
  insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at)
  values ('verify054:test_sold', 'legacy', pid, 'Verify listing', 10, 'GBP', now(), 'sold', now());
  assert (select location_filter is null and site is null and item_country is null
          from market_listings where source_id = 'verify054:test_sold' and external_id = 'legacy'),
         '6a a row without provenance does not default to NULL';

  for bad in select * from (values
      ('site', 'de'), ('location_filter', 'local'), ('item_country', 'GBR'),
      ('item_country', 'gb'), ('item_country', 'London'), ('displayed_currency', 'gbp')) as t(col, val) loop
    ok := false;
    begin
      execute format(
        'insert into market_listings (source_id, external_id, pin_id, title, price, currency, sold_date, price_kind, last_seen_at, %I)
         values (%L, %L, %L, %L, 10, %L, now(), %L, now(), %L)',
        bad.col, 'verify054:test_sold', 'bad-' || bad.col || '-' || bad.val, pid, 'x', 'GBP', 'sold', bad.val);
    exception when check_violation then ok := true;
    end;
    assert ok, format('6b %s = %s was accepted', bad.col, bad.val);
  end loop;
end $$;

select 'ALL 054 CHECKS PASSED' as result;

rollback;
