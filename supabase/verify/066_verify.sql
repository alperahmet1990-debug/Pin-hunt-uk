-- ============================================================
-- Verification for migration 066 (run in the Supabase SQL editor, as the
-- default postgres user, after applying 066).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users and
-- a throwaway pin, so it leaves nothing behind. Expected final output: a single
-- row 'ALL 066 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- ============================================================
begin;

create or replace function pg_temp.v066_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- Runs p_sql as the signed-in user p_uid; returns the SQLSTATE it failed
-- with, or null if it succeeded.
create or replace function pg_temp.v066_try(p_uid uuid, p_sql text) returns text language plpgsql as $$
begin
  perform pg_temp.v066_as(p_uid);
  begin
    set local role authenticated;
    execute p_sql;
    reset role;
    return null;
  exception when others then
    reset role;
    return sqlstate;
  end;
end $$;

-- Counts the rows p_sql returns when run as the signed-in user p_uid.
create or replace function pg_temp.v066_count(p_uid uuid, p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  perform pg_temp.v066_as(p_uid);
  set local role authenticated;
  execute format('select count(*) from (%s) q', p_sql) into n;
  reset role;
  return n;
end $$;

-- 1. Structure and grants
do $$ begin
  assert to_regclass('public.collection_places') is not null, '1a collection_places missing';
  assert to_regclass('public.user_pin_locations') is not null, '1b user_pin_locations missing';
  assert (select relrowsecurity from pg_class where oid = 'public.collection_places'::regclass), '1c RLS off on collection_places';
  assert (select relrowsecurity from pg_class where oid = 'public.user_pin_locations'::regclass), '1d RLS off on user_pin_locations';
  assert not has_table_privilege('anon', 'public.collection_places', 'select'), '1e anon reads collection_places';
  assert not has_table_privilege('anon', 'public.user_pin_locations', 'select'), '1f anon reads user_pin_locations';
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'user_pins'
                        and column_name in ('place_id', 'page', 'pocket', 'location')),
         '1g a location column was added to user_pins (readable through the For Trade policy)';
end $$;

-- 2. Scenario data. A and B are collectors; both own the throwaway pin.
insert into auth.users (id, email) values
  ('06600000-0000-4000-8000-00000000000a', 'verify066-a@example.invalid'),
  ('06600000-0000-4000-8000-00000000000b', 'verify066-b@example.invalid');
insert into pins (id, pinhunt_id, title, brand, collection, verification_status) values
  ('06600000-0000-4000-8000-0000000000f1', 'PHUK-VERIFY66A', 'Verify 066 pin', 'Disney', '', 'verified'),
  ('06600000-0000-4000-8000-0000000000f2', 'PHUK-VERIFY66B', 'Verify 066 pin 2', 'Disney', '', 'verified');
insert into user_pins (user_id, pin_id, status) values
  ('06600000-0000-4000-8000-00000000000a', '06600000-0000-4000-8000-0000000000f1', 'for_trade'),
  ('06600000-0000-4000-8000-00000000000a', '06600000-0000-4000-8000-0000000000f2', 'owned'),
  ('06600000-0000-4000-8000-00000000000b', '06600000-0000-4000-8000-0000000000f1', 'owned');

-- 3. A records places and locations as themself
do $$ begin
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000a', $q$
    insert into collection_places (id, name, kind, pages, pockets_per_page) values
      ('06600000-0000-4000-8000-0000000000c1', 'Trade book 2', 'book', 12, 9),
      ('06600000-0000-4000-8000-0000000000c2', 'Display frame, hallway', 'display', null, null)
  $q$) is null, '3a A cannot create places';
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000a', $q$
    insert into user_pin_locations (pin_id, place_id, page, pocket) values
      ('06600000-0000-4000-8000-0000000000f1', '06600000-0000-4000-8000-0000000000c1', 5, 2),
      ('06600000-0000-4000-8000-0000000000f2', '06600000-0000-4000-8000-0000000000c2', null, null)
  $q$) is null, '3b A cannot place their pins';
  assert pg_temp.v066_count('06600000-0000-4000-8000-00000000000a', 'select * from user_pin_locations') = 2,
         '3c A cannot read their locations';
  assert (select user_id from collection_places where id = '06600000-0000-4000-8000-0000000000c1')
         = '06600000-0000-4000-8000-00000000000a', '3d place not owned by A by default';
end $$;

-- 4. Privacy: B sees A's For Trade row (existing policy) but none of A's places or locations
do $$ begin
  assert pg_temp.v066_count('06600000-0000-4000-8000-00000000000b',
         $q$select * from user_pins where user_id = '06600000-0000-4000-8000-00000000000a'$q$) = 1,
         '4a expected B to see A''s For Trade row (migration 006)';
  assert pg_temp.v066_count('06600000-0000-4000-8000-00000000000b', 'select * from collection_places') = 0,
         '4b B reads A''s places';
  assert pg_temp.v066_count('06600000-0000-4000-8000-00000000000b', 'select * from user_pin_locations') = 0,
         '4c B reads A''s locations';
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000b',
         $q$update collection_places set name = 'hacked'$q$) is null, '4d update errored';
  assert (select name from collection_places where id = '06600000-0000-4000-8000-0000000000c1') = 'Trade book 2',
         '4e B renamed A''s place';
  perform pg_temp.v066_try('06600000-0000-4000-8000-00000000000b', 'delete from user_pin_locations');
  assert (select count(*) from user_pin_locations where user_id = '06600000-0000-4000-8000-00000000000a') = 2,
         '4f B deleted A''s locations';
end $$;

-- 5. Integrity: no placing into someone else's place, for someone else, or for pins you don't have
do $$ begin
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000b', $q$
    insert into user_pin_locations (pin_id, place_id) values
      ('06600000-0000-4000-8000-0000000000f1', '06600000-0000-4000-8000-0000000000c1')
  $q$) = '23503', '5a B placed a pin in A''s place';
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000b', $q$
    insert into user_pin_locations (user_id, pin_id, place_id) values
      ('06600000-0000-4000-8000-00000000000a', '06600000-0000-4000-8000-0000000000f2', '06600000-0000-4000-8000-0000000000c1')
  $q$) = '42501', '5b B wrote a location for A';
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000b', $q$
    insert into collection_places (user_id, name) values ('06600000-0000-4000-8000-00000000000a', 'Planted')
  $q$) = '42501', '5c B created a place for A';
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000b', $q$
    insert into collection_places (id, name) values ('06600000-0000-4000-8000-0000000000c3', 'B book');
    insert into user_pin_locations (pin_id, place_id) values
      ('06600000-0000-4000-8000-0000000000f2', '06600000-0000-4000-8000-0000000000c3')
  $q$) = '23503', '5d B placed a pin they don''t have';
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000a', $q$
    update user_pin_locations set page = null, pocket = 3
     where pin_id = '06600000-0000-4000-8000-0000000000f1'
  $q$) = '23514', '5e pocket allowed without a page';
  assert pg_temp.v066_try('06600000-0000-4000-8000-00000000000a', $q$
    insert into collection_places (name) values ('   ')
  $q$) = '23514', '5f blank place name allowed';
end $$;

-- 6. Lifecycle: For Trade keeps the location, ISO clears it, removing the pin removes it,
--    deleting a place unplaces its pins
do $$ begin
  perform pg_temp.v066_as('06600000-0000-4000-8000-00000000000a');
  perform set_user_pin_status('PHUK-VERIFY66B', 'for_trade', 1);
  assert exists (select 1 from user_pin_locations where user_id = '06600000-0000-4000-8000-00000000000a'
                   and pin_id = '06600000-0000-4000-8000-0000000000f2'), '6a For Trade lost the location';
  perform set_user_pin_status('PHUK-VERIFY66B', 'wanted', 1);
  assert not exists (select 1 from user_pin_locations where user_id = '06600000-0000-4000-8000-00000000000a'
                       and pin_id = '06600000-0000-4000-8000-0000000000f2'), '6b ISO kept the location';
  perform set_user_pin_status('PHUK-VERIFY66A', 'none', 1);
  assert not exists (select 1 from user_pin_locations where user_id = '06600000-0000-4000-8000-00000000000a'
                       and pin_id = '06600000-0000-4000-8000-0000000000f1'), '6c removed pin kept its location';

  insert into user_pins (user_id, pin_id, status) values
    ('06600000-0000-4000-8000-00000000000a', '06600000-0000-4000-8000-0000000000f1', 'owned');
  insert into user_pin_locations (user_id, pin_id, place_id, page, pocket) values
    ('06600000-0000-4000-8000-00000000000a', '06600000-0000-4000-8000-0000000000f1', '06600000-0000-4000-8000-0000000000c1', 1, 1);
  delete from collection_places where id = '06600000-0000-4000-8000-0000000000c1';
  assert not exists (select 1 from user_pin_locations where place_id = '06600000-0000-4000-8000-0000000000c1'),
         '6d deleting a place left locations behind';
  assert exists (select 1 from user_pins where user_id = '06600000-0000-4000-8000-00000000000a'
                   and pin_id = '06600000-0000-4000-8000-0000000000f1'), '6e deleting a place removed the pin';
end $$;

-- 7. Deleting an account removes its places and locations
do $$ begin
  insert into user_pin_locations (user_id, pin_id, place_id) values
    ('06600000-0000-4000-8000-00000000000a', '06600000-0000-4000-8000-0000000000f1', '06600000-0000-4000-8000-0000000000c2');
  delete from auth.users where id = '06600000-0000-4000-8000-00000000000a';
  assert not exists (select 1 from collection_places where user_id = '06600000-0000-4000-8000-00000000000a'), '7a places left behind';
  assert not exists (select 1 from user_pin_locations where user_id = '06600000-0000-4000-8000-00000000000a'), '7b locations left behind';
end $$;

select 'ALL 066 CHECKS PASSED' as result;

rollback;
