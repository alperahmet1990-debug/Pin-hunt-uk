-- ============================================================
-- Verification for migration 068 (run on STAGING after applying 068, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway users, so it
-- leaves nothing behind. Expected final output: a single row
-- 'ALL 068 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- ============================================================
begin;

create or replace function pg_temp.v068_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- 1. Column, default, constraint and grants
do $$
begin
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'home_market'
      and is_nullable = 'NO' and column_default like '%UK%'
  ), '1a home_market missing, nullable or without the UK default';
  assert has_column_privilege('authenticated', 'public.profiles', 'home_market', 'select'), '1b signed-in cannot read home_market';
  assert has_column_privilege('authenticated', 'public.profiles', 'home_market', 'update'), '1c signed-in cannot update home_market';
  assert has_column_privilege('authenticated', 'public.profiles', 'home_market', 'insert'), '1d signed-in cannot insert home_market';
  assert not has_column_privilege('anon', 'public.profiles', 'home_market', 'select'), '1e anon reads home_market';
  -- 063's private columns stay private.
  assert not has_column_privilege('authenticated', 'public.profiles', 'postcode', 'select'), '1f postcode became readable';
end $$;

-- 2. Every existing profile has a valid market
do $$
begin
  assert not exists (select 1 from profiles where home_market not in ('UK', 'US')), '2a invalid home_market on an existing profile';
  assert not exists (
    select 1 from profiles
    where lower(trim(coalesce(country, ''))) in ('us', 'usa', 'united states', 'united states of america')
      and home_market <> 'US'
  ), '2b a US profile was not backfilled to US';
end $$;

-- 3. Behaviour
insert into auth.users (id) values
  ('06800000-0000-4000-8000-0000000000a1'), ('06800000-0000-4000-8000-0000000000b2');
insert into profiles (id) values
  ('06800000-0000-4000-8000-0000000000a1'), ('06800000-0000-4000-8000-0000000000b2')
  on conflict (id) do nothing;

do $$
declare
  a uuid := '06800000-0000-4000-8000-0000000000a1';
  b uuid := '06800000-0000-4000-8000-0000000000b2';
  v text;
  n integer;
begin
  select home_market into v from profiles where id = a;
  assert v = 'UK', format('3a new profile default %s', v);

  -- A sets their own market.
  perform pg_temp.v068_as(a);
  set local role authenticated;
  update profiles set home_market = 'US', updated_at = now() where id = a;
  select home_market into v from profiles where id = a;
  assert v = 'US', format('3b own update did not save (%s)', v);

  -- A can't change B's.
  update profiles set home_market = 'US' where id = b;
  get diagnostics n = row_count;
  reset role;
  select home_market into v from profiles where id = b;
  assert v = 'UK', '3c changed another collector''s home market';

  -- Only UK or US.
  begin
    update profiles set home_market = 'FR' where id = a;
    assert false, '3d accepted FR';
  exception when check_violation then null;
  end;
end $$;

select 'ALL 068 CHECKS PASSED' as result;
rollback;
