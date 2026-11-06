-- ============================================================
-- Verification for migration 062 (run in the Supabase SQL editor, as the
-- default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users, so
-- it leaves nothing behind. Expected final output: a single row
-- 'ALL 062 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- ============================================================
begin;

create or replace function pg_temp.v062_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v062_refused(p_role text, p_sql text)
returns boolean language plpgsql as $$
begin
  begin
    execute format('set local role %I', p_role);
    execute p_sql;
    reset role;
    return false;
  exception when insufficient_privilege then
    reset role;
    return true;
  end;
end $$;

-- 1. Grants
do $$
declare c text;
begin
  foreach c in array array['postcode', 'approx_lat', 'approx_lng'] loop
    assert not has_column_privilege('anon', 'public.profiles', c, 'select'), format('1a anon reads %s', c);
    assert not has_column_privilege('authenticated', 'public.profiles', c, 'select'), format('1b signed-in reads %s', c);
  end loop;
  foreach c in array array['id', 'username', 'display_name', 'avatar_url', 'bio', 'trading_region',
                           'town', 'county', 'has_location_set', 'profile_visibility', 'is_admin'] loop
    assert has_column_privilege('authenticated', 'public.profiles', c, 'select'), format('1c signed-in cannot read %s', c);
    assert not has_column_privilege('anon', 'public.profiles', c, 'select'), format('1d anon reads %s', c);
  end loop;
  assert not has_table_privilege('anon', 'public.profiles', 'select'), '1e anon table select';
  assert not has_table_privilege('authenticated', 'public.profiles', 'select'), '1f signed-in table select';
  assert not has_table_privilege('anon', 'public.public_profiles', 'select'), '1g anon view select';
  assert has_table_privilege('authenticated', 'public.public_profiles', 'select'), '1h signed-in view select';
  assert not has_function_privilege('anon', 'public.get_my_postcode()', 'execute'), '1i anon can run';
  assert has_function_privilege('authenticated', 'public.get_my_postcode()', 'execute'), '1j signed-in cannot run';
  assert not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Public profiles are visible to all'), '1k old policy';
end $$;

-- 2. Behaviour
insert into auth.users (id) values
  ('06200000-0000-4000-8000-0000000000a1'), ('06200000-0000-4000-8000-0000000000b2');
insert into profiles (id) values
  ('06200000-0000-4000-8000-0000000000a1'), ('06200000-0000-4000-8000-0000000000b2')
  on conflict (id) do nothing;
update profiles set username = 'v062_a', postcode = 'AA1 1AA', approx_lat = 51.5, approx_lng = -0.1,
  profile_visibility = 'public'
  where id = '06200000-0000-4000-8000-0000000000a1';
update profiles set username = 'v062_b', postcode = 'BB2 2BB', profile_visibility = 'public'
  where id = '06200000-0000-4000-8000-0000000000b2';

do $$
declare
  a uuid := '06200000-0000-4000-8000-0000000000a1';
  b uuid := '06200000-0000-4000-8000-0000000000b2';
  n integer;
  v text;
begin
  assert pg_temp.v062_refused('anon', 'select id from public.profiles limit 1'), '2a anon read profiles';
  assert pg_temp.v062_refused('anon', 'select id from public.public_profiles limit 1'), '2b anon read view';

  perform pg_temp.v062_as(b);
  assert pg_temp.v062_refused('authenticated', 'select postcode from public.profiles limit 1'), '2c read postcode';
  assert pg_temp.v062_refused('authenticated', 'select approx_lat from public.profiles limit 1'), '2d read coordinates';
  assert pg_temp.v062_refused('authenticated', 'select * from public.profiles limit 1'), '2e select star';

  set local role authenticated;
  select count(*) into n from profiles where id = a and username = 'v062_a';
  assert n = 1, '2f signed-in cannot read a public profile';
  select get_my_postcode() into v;
  assert v = 'BB2 2BB', '2g own postcode wrong';
  update profiles set postcode = 'CC3 3CC', bio = 'Changed' where id = b;
  select get_my_postcode() into v;
  assert v = 'CC3 3CC', '2h could not save own postcode';
  update profiles set bio = 'Changed' where id = a;
  reset role;
  assert (select bio from profiles where id = a) is distinct from 'Changed', '2i edited another profile';

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  set local role authenticated;
  select get_my_postcode() into v;
  reset role;
  assert v is null, '2j postcode with no user';
end $$;

select 'ALL 062 CHECKS PASSED' as result;
rollback;
