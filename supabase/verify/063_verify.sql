-- ============================================================
-- Verification for migrations 062 and 063 (run in the Supabase SQL editor, as the
-- default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users, so
-- it leaves nothing behind. Expected final output: a single row
-- 'ALL 063 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- ============================================================
begin;

create or replace function pg_temp.v063_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v063_refused(p_role text, p_sql text)
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
declare c text; n integer;
begin
  foreach c in array array['postcode', 'approx_lat', 'approx_lng', 'is_contributor'] loop
    assert not has_column_privilege('anon', 'public.profiles', c, 'select'), format('1a anon reads %s', c);
    assert not has_column_privilege('authenticated', 'public.profiles', c, 'select'), format('1b signed-in reads %s', c);
  end loop;
  foreach c in array array['id', 'username', 'display_name', 'avatar_url', 'bio', 'location', 'is_admin', 'created_at',
                           'updated_at', 'trading_region', 'international_trading_enabled', 'allow_trade_requests',
                           'allow_messages', 'profile_visibility', 'town', 'county', 'country', 'has_location_set',
                           'nearby_discovery_enabled', 'preferred_radius_miles', 'open_to_local_trades',
                           'open_to_postal_trades', 'happy_to_travel'] loop
    assert has_column_privilege('authenticated', 'public.profiles', c, 'select'), format('1c signed-in cannot read %s', c);
    assert not has_column_privilege('anon', 'public.profiles', c, 'select'), format('1d anon reads %s', c);
  end loop;
  foreach c in array array['updated_at', 'username', 'display_name', 'avatar_url', 'bio', 'location', 'trading_region',
                           'international_trading_enabled', 'allow_trade_requests', 'allow_messages', 'profile_visibility',
                           'town', 'county', 'country', 'nearby_discovery_enabled', 'preferred_radius_miles',
                           'open_to_local_trades', 'open_to_postal_trades', 'happy_to_travel'] loop
    assert has_column_privilege('authenticated', 'public.profiles', c, 'insert'), format('1r cannot insert %s', c);
    assert has_column_privilege('authenticated', 'public.profiles', c, 'update'), format('1s cannot update %s', c);
  end loop;
  foreach c in array array['postcode', 'approx_lat', 'approx_lng', 'has_location_set', 'is_admin', 'is_contributor', 'is_app_creator'] loop
    assert not has_column_privilege('authenticated', 'public.profiles', c, 'update'), format('1e signed-in updates %s', c);
    assert not has_column_privilege('authenticated', 'public.profiles', c, 'insert'), format('1f signed-in inserts %s', c);
  end loop;
  assert not has_table_privilege('anon', 'public.profiles', 'select'), '1g anon table select';
  assert not has_table_privilege('authenticated', 'public.profiles', 'select'), '1h signed-in table select';
  assert not has_table_privilege('authenticated', 'public.profiles', 'update'), '1i signed-in table update';
  assert not has_table_privilege('anon', 'public.public_profiles', 'select'), '1j anon view select';
  assert has_table_privilege('authenticated', 'public.public_profiles', 'select'), '1k signed-in view select';
  assert not has_function_privilege('anon', 'public.get_my_postcode()', 'execute'), '1l anon can run';
  assert has_function_privilege('authenticated', 'public.get_my_postcode()', 'execute'), '1m signed-in cannot run';
  assert not exists (select 1 from pg_policies where tablename = 'profiles'
    and policyname in ('Public profiles are visible to all', 'profiles_select_authenticated')), '1n old policy';
  assert exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_select_public'), '1o public policy lost';
  assert not exists (select 1 from pg_publication_tables where tablename = 'profiles'), '1p profiles in a publication';
  select count(distinct v.oid) into n
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join pg_class v on v.oid = r.ev_class
  where d.refobjid = 'public.profiles'::regclass and v.relkind in ('v', 'm')
    and v.oid <> 'public.public_profiles'::regclass
    and has_table_privilege('anon', v.oid, 'select');
  assert n = 0, '1q another view reads profiles';
end $$;

-- 2. Behaviour
insert into auth.users (id) values
  ('06300000-0000-4000-8000-0000000000a1'), ('06300000-0000-4000-8000-0000000000b2'),
  ('06300000-0000-4000-8000-0000000000c3');
insert into profiles (id) values
  ('06300000-0000-4000-8000-0000000000a1'), ('06300000-0000-4000-8000-0000000000b2'),
  ('06300000-0000-4000-8000-0000000000c3')
  on conflict (id) do nothing;
update profiles set username = 'v063_a', postcode = 'AA1 1AA', approx_lat = 51.5, approx_lng = -0.1,
  profile_visibility = 'public'
  where id = '06300000-0000-4000-8000-0000000000a1';
update profiles set username = 'v063_b', postcode = 'BB2 2BB', profile_visibility = 'public'
  where id = '06300000-0000-4000-8000-0000000000b2';
update profiles set username = 'v063_c', profile_visibility = 'private'
  where id = '06300000-0000-4000-8000-0000000000c3';

do $$
declare
  a uuid := '06300000-0000-4000-8000-0000000000a1';
  b uuid := '06300000-0000-4000-8000-0000000000b2';
  n integer;
  v text;
  v_id uuid;
  v_flag boolean;
begin
  assert pg_temp.v063_refused('anon', 'select id from public.profiles limit 1'), '2a anon read profiles';
  assert pg_temp.v063_refused('anon', 'select id from public.public_profiles limit 1'), '2b anon read view';

  perform pg_temp.v063_as(b);
  assert pg_temp.v063_refused('authenticated', 'select postcode from public.profiles limit 1'), '2c read postcode';
  assert pg_temp.v063_refused('authenticated', 'select approx_lat from public.profiles limit 1'), '2d read coordinates';
  assert pg_temp.v063_refused('authenticated', 'select * from public.profiles limit 1'), '2e select star';
  assert pg_temp.v063_refused('authenticated', 'select id from public.profiles where postcode like ''A%'''), '2l filtered on postcode';
  assert pg_temp.v063_refused('authenticated', 'select id from public.profiles order by approx_lat'), '2m ordered on coordinates';
  assert pg_temp.v063_refused('authenticated', format('update public.profiles set approx_lat = 1 where id = %L', b)), '2n wrote own coordinates';
  assert pg_temp.v063_refused('authenticated', format('update public.profiles set postcode = ''X'' where id = %L', b)), '2o wrote own postcode';
  assert pg_temp.v063_refused('authenticated', format('update public.profiles set has_location_set = true where id = %L', b)), '2p wrote location flag';
  assert pg_temp.v063_refused('authenticated', format('update public.profiles set is_admin = true where id = %L', b)), '2q wrote admin flag';

  set local role authenticated;
  select count(*) into n from profiles where id = a and username = 'v063_a';
  assert n = 1, '2f signed-in cannot read a public profile';
  select get_my_postcode() into v;
  assert v = 'BB2 2BB', '2g own postcode wrong';
  update profiles set bio = 'Changed' where id = b;
  assert (select count(*) from profiles where username = 'v063_c') = 0, '2h private profile visible';
  -- The app's save: an upsert returning its column list.
  insert into profiles (id, updated_at, bio, town) values (b, now(), 'Upserted', 'Town')
    on conflict (id) do update set updated_at = excluded.updated_at, bio = excluded.bio, town = excluded.town
    returning id, username, bio, town, has_location_set into v_id, v, v, v, v_flag;
  assert v_id = b, '2k upsert failed';
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

select 'ALL 063 CHECKS PASSED' as result;
rollback;
