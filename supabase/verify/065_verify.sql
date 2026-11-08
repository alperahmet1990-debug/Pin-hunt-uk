-- ============================================================
-- Verification for migration 065 (run in the Supabase SQL editor, as the
-- default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway users, pins
-- and prices, so it leaves nothing behind. Expected final output: a single row
-- 'ALL 065 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- ============================================================
begin;

create or replace function pg_temp.v065_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
         set_config('request.jwt.claims',
           case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
$$;

-- Runs p_sql as p_role and user p_uid; true when it raised any error.
create or replace function pg_temp.v065_fails(p_role text, p_uid uuid, p_sql text)
returns boolean language plpgsql as $$
begin
  perform pg_temp.v065_as(p_uid);
  begin
    execute format('set local role %I', p_role);
    execute p_sql;
    reset role;
    return false;
  exception when others then
    reset role;
    return true;
  end;
end $$;

-- 1. Grants: no direct table access for clients; functions for signed-in only.
do $$
declare f text;
begin
  assert not has_table_privilege('authenticated', 'public.collector_pin_prices', 'select'), '1a signed-in reads the price table';
  assert not has_table_privilege('authenticated', 'public.collector_pin_prices', 'insert'), '1b signed-in writes the price table';
  assert not has_table_privilege('anon', 'public.collector_pin_prices', 'select'), '1c anon reads the price table';
  assert not has_table_privilege('authenticated', 'public.collector_price_settings', 'select'), '1d signed-in reads settings';
  foreach f in array array[
    'public.set_my_pin_price(text, text, numeric)', 'public.clear_my_pin_price(text, text)',
    'public.get_my_pin_prices(text[])', 'public.get_my_community_price_setting()',
    'public.set_my_community_price_setting(boolean)', 'public.get_community_prices(text[], text)'] loop
    assert has_function_privilege('authenticated', f, 'execute'), format('1e signed-in cannot run %s', f);
    assert not has_function_privilege('anon', f, 'execute'), format('1f anon can run %s', f);
  end loop;
end $$;

-- 2. Test data. Users a–h; a–f are old enough to count. g is new, h suspended.
insert into auth.users (id) values
  ('06500000-0000-4000-8000-0000000000a1'), ('06500000-0000-4000-8000-0000000000b2'),
  ('06500000-0000-4000-8000-0000000000c3'), ('06500000-0000-4000-8000-0000000000d4'),
  ('06500000-0000-4000-8000-0000000000e5'), ('06500000-0000-4000-8000-0000000000f6'),
  ('06500000-0000-4000-8000-0000000000a7'), ('06500000-0000-4000-8000-0000000000b8');
insert into profiles (id) values
  ('06500000-0000-4000-8000-0000000000a1'), ('06500000-0000-4000-8000-0000000000b2'),
  ('06500000-0000-4000-8000-0000000000c3'), ('06500000-0000-4000-8000-0000000000d4'),
  ('06500000-0000-4000-8000-0000000000e5'), ('06500000-0000-4000-8000-0000000000f6'),
  ('06500000-0000-4000-8000-0000000000a7'), ('06500000-0000-4000-8000-0000000000b8')
  on conflict (id) do nothing;
update profiles set created_at = now() - interval '30 days'
  where id::text like '06500000-%' and id <> '06500000-0000-4000-8000-0000000000a7';
update profiles set created_at = now() - interval '1 day'
  where id = '06500000-0000-4000-8000-0000000000a7';
insert into user_suspensions (user_id) values ('06500000-0000-4000-8000-0000000000b8');

insert into pins (pinhunt_id, title, brand, collection, verification_status)
values ('PHUK-T0650001', 'Verify 065 – Early', 'Disney Parks', 'Verify 065', 'verified'),
       ('PHUK-T0650002', 'Verify 065 – Confident', 'Disney Parks', 'Verify 065', 'verified'),
       ('PHUK-T0650003', 'Verify 065 – Outliers', 'Disney Parks', 'Verify 065', 'verified'),
       ('PHUK-T0650004', 'Verify 065 – Not owned', 'Disney Parks', 'Verify 065', 'verified');

-- Everyone owns pins 1–3; a has pin 4 only on their ISO.
insert into user_pins (user_id, pin_id, status)
select u.id, p.id, case when u.id::text like '%c3' then 'for_trade' else 'owned' end
from profiles u, pins p
where u.id::text like '06500000-%' and p.pinhunt_id in ('PHUK-T0650001', 'PHUK-T0650002', 'PHUK-T0650003');
insert into user_pins (user_id, pin_id, status)
select '06500000-0000-4000-8000-0000000000a1', id, 'wanted' from pins where pinhunt_id = 'PHUK-T0650004';

-- 3. Writes go through the function, only for pins owned or For Trade.
do $$
declare a uuid := '06500000-0000-4000-8000-0000000000a1';
begin
  assert pg_temp.v065_fails('anon', null, $q$select set_my_pin_price('PHUK-T0650001', 'GBP', 12)$q$), '3a anon set a price';
  assert pg_temp.v065_fails('authenticated', null, $q$select set_my_pin_price('PHUK-T0650001', 'GBP', 12)$q$), '3b no user set a price';
  assert pg_temp.v065_fails('authenticated', a, $q$select set_my_pin_price('PHUK-T0650004', 'GBP', 12)$q$), '3c priced an ISO-only pin';
  assert pg_temp.v065_fails('authenticated', a, $q$select set_my_pin_price('PHUK-T0650001', 'EUR', 12)$q$), '3d accepted EUR';
  assert pg_temp.v065_fails('authenticated', a, $q$select set_my_pin_price('PHUK-T0650001', 'GBP', 0)$q$), '3e accepted 0';
  assert pg_temp.v065_fails('authenticated', a, $q$select set_my_pin_price('PHUK-NOPE', 'GBP', 5)$q$), '3f accepted an unknown pin';
  assert pg_temp.v065_fails('authenticated', a, $q$insert into collector_pin_prices (user_id, pin_id, currency, amount) select auth.uid(), id, 'GBP', 1 from pins limit 1$q$), '3g wrote the table directly';
  assert pg_temp.v065_fails('authenticated', a, $q$select * from collector_pin_prices$q$), '3h read the table directly';
end $$;

-- Prices. Pin 1 (early): a £12, b £15. Pin 2 (confident): a, b, c in GBP; a in USD.
-- Pin 3 (outliers): a–f, one far too high. g (new) and h (suspended) price everything.
do $$
declare
  u uuid;
  amounts numeric[] := array[10, 11, 12, 13, 14, 200];
  i integer := 0;
begin
  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000a1');
  set local role authenticated;
  perform set_my_pin_price('PHUK-T0650001', 'GBP', 12);
  perform set_my_pin_price('PHUK-T0650002', 'GBP', 20);
  perform set_my_pin_price('PHUK-T0650002', 'USD', 25);
  reset role;

  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000b2');
  set local role authenticated;
  perform set_my_pin_price('PHUK-T0650001', 'GBP', 15);
  perform set_my_pin_price('PHUK-T0650002', 'GBP', 22);
  reset role;

  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000c3');
  set local role authenticated;
  perform set_my_pin_price('PHUK-T0650002', 'GBP', 30);
  reset role;

  foreach u in array array[
    '06500000-0000-4000-8000-0000000000a1', '06500000-0000-4000-8000-0000000000b2',
    '06500000-0000-4000-8000-0000000000c3', '06500000-0000-4000-8000-0000000000d4',
    '06500000-0000-4000-8000-0000000000e5', '06500000-0000-4000-8000-0000000000f6']::uuid[] loop
    i := i + 1;
    perform pg_temp.v065_as(u);
    set local role authenticated;
    perform set_my_pin_price('PHUK-T0650003', 'GBP', amounts[i]);
    reset role;
  end loop;

  foreach u in array array['06500000-0000-4000-8000-0000000000a7', '06500000-0000-4000-8000-0000000000b8']::uuid[] loop
    perform pg_temp.v065_as(u);
    set local role authenticated;
    perform set_my_pin_price('PHUK-T0650001', 'GBP', 99);
    perform set_my_pin_price('PHUK-T0650002', 'GBP', 99);
    reset role;
  end loop;
end $$;

-- 4. Community prices
do $$
declare r record; n integer;
begin
  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000d4');
  set local role authenticated;

  -- 4a Early: two collectors, entries shown, new and suspended accounts ignored.
  select * into r from get_community_prices(array['PHUK-T0650001'], 'GBP');
  assert r.collector_count = 2, format('4a count %s', r.collector_count);
  assert r.step = 'early', format('4a step %s', r.step);
  assert r.median = 13.5, format('4a median %s', r.median);
  assert r.entries = array[12, 15]::numeric[], format('4a entries %s', r.entries);

  -- 4b Confident at 3, no entries, range from min to max.
  select * into r from get_community_prices(array['PHUK-T0650002'], 'GBP');
  assert r.collector_count = 3 and r.step = 'confident', format('4b %s %s', r.collector_count, r.step);
  assert r.entries is null, '4b entries shown when confident';
  assert r.median = 22 and r.low = 20 and r.high = 30, format('4b %s %s %s', r.median, r.low, r.high);

  -- 4c Currencies are separate.
  select * into r from get_community_prices(array['PHUK-T0650002'], 'USD');
  assert r.collector_count = 1 and r.median = 25 and r.step = 'early', '4c USD';

  -- 4d Outlier left out from 5 collectors.
  select * into r from get_community_prices(array['PHUK-T0650003'], 'GBP');
  assert r.collector_count = 5, format('4d count %s', r.collector_count);
  assert r.median = 12, format('4d median %s', r.median);

  -- 4e Batch call; pins with no prices are simply absent.
  select count(*) into n from get_community_prices(
    array['PHUK-T0650001', 'PHUK-T0650002', 'PHUK-T0650003', 'PHUK-T0650004'], 'GBP');
  assert n = 3, format('4e rows %s', n);

  reset role;
end $$;

-- 5. Totals never carry a user id.
do $$
begin
  assert not exists (
    select 1 from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_name = 'get_community_prices' and p.parameter_mode = 'OUT'
      and p.parameter_name like '%user%'
  ), '5a get_community_prices returns a user column';
end $$;

-- 6. Leaving the collection, opting out and older prices stop counting.
do $$
declare r record;
begin
  -- c stops having pin 2: back to early with 2.
  delete from user_pins where user_id = '06500000-0000-4000-8000-0000000000c3'
    and pin_id = (select id from pins where pinhunt_id = 'PHUK-T0650002');
  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000a1');
  set local role authenticated;
  select * into r from get_community_prices(array['PHUK-T0650002'], 'GBP');
  assert r.collector_count = 2 and r.step = 'early', '6a no longer owned still counted';

  -- b opts out.
  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000b2');
  assert get_my_community_price_setting() = true, '6b default is not on';
  perform set_my_community_price_setting(false);
  assert get_my_community_price_setting() = false, '6c opt-out not saved';
  select * into r from get_community_prices(array['PHUK-T0650002'], 'GBP');
  assert r.collector_count = 1, '6d opted-out price still counted';
  reset role;

  -- a's price is over a year old.
  update collector_pin_prices set updated_at = now() - interval '13 months'
  where user_id = '06500000-0000-4000-8000-0000000000a1';
  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000d4');
  set local role authenticated;
  select * into r from get_community_prices(array['PHUK-T0650002'], 'GBP');
  assert r is null or r.collector_count is null, '6e old price still counted';
  reset role;
end $$;

-- 7. Own prices: each collector sees only their own; clear removes one.
do $$
declare n integer;
begin
  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000b2');
  set local role authenticated;
  select count(*) into n from get_my_pin_prices(array['PHUK-T0650001', 'PHUK-T0650002', 'PHUK-T0650003']);
  assert n = 3, format('7a own prices %s', n);
  perform clear_my_pin_price('PHUK-T0650001', 'GBP');
  select count(*) into n from get_my_pin_prices(array['PHUK-T0650001']);
  assert n = 0, '7b clear did not remove';
  reset role;

  perform pg_temp.v065_as('06500000-0000-4000-8000-0000000000d4');
  set local role authenticated;
  select count(*) into n from get_my_pin_prices(array['PHUK-T0650001', 'PHUK-T0650002']);
  assert n = 0, '7c saw another collector''s prices';
  reset role;
end $$;

select 'ALL 065 CHECKS PASSED' as result;
rollback;
