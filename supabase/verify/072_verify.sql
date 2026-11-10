-- ============================================================
-- Verification for migration 072 (run on STAGING after applying 072, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway users, so it
-- leaves nothing behind. Expected final output: a single row
-- 'ALL 072 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- Role-based: each behaviour check runs as `authenticated` with a fake JWT.
-- ============================================================

-- Project guard (see 072_RUNBOOK.md). Set target to the project you mean.
do $$
declare
  target text := 'staging';  -- <- 'staging' or 'production'
  actual text;
begin
  if to_regprocedure('public.pinhunt_environment()') is null then
    raise exception 'Project guard: pinhunt_environment() is missing (072_RUNBOOK.md).';
  end if;
  execute 'select public.pinhunt_environment()' into actual;
  if actual is distinct from target then
    raise exception 'Project guard: this is %, not %.', actual, target;
  end if;
end $$;

begin;

create or replace function pg_temp.v072_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- 1. Columns exist and no client role can touch them directly
do $$
declare
  col text;
  priv text;
  r text;
begin
  foreach col in array array['age_confirmed_at', 'age_declined_at'] loop
    assert exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = col
        and data_type = 'timestamp with time zone'
    ), format('1a %s missing or wrong type', col);
    foreach r in array array['anon', 'authenticated'] loop
      foreach priv in array array['select', 'insert', 'update'] loop
        assert not has_column_privilege(r, 'public.profiles', col, priv),
          format('1b %s has %s on %s', r, priv, col);
      end loop;
    end loop;
  end loop;
  -- No column anywhere holds a birth date.
  assert not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and column_name ilike any (array['%birth%', '%dob%'])
  ), '1c a birth date column exists';
  -- Earlier private columns stay private.
  assert not has_column_privilege('authenticated', 'public.profiles', 'postcode', 'select'), '1d postcode became readable';
end $$;

-- 2. Function access
do $$
begin
  assert has_function_privilege('authenticated', 'public.confirm_my_age(date)', 'execute'), '2a confirm_my_age';
  assert has_function_privilege('authenticated', 'public.confirm_my_age_from_signup()', 'execute'), '2b from_signup';
  assert has_function_privilege('authenticated', 'public.get_my_age_status()', 'execute'), '2c status';
  assert has_function_privilege('authenticated', 'public.admin_set_age_declined(uuid, boolean)', 'execute'), '2d admin';
  assert not has_function_privilege('anon', 'public.confirm_my_age(date)', 'execute'), '2e anon confirm';
  assert not has_function_privilege('anon', 'public.confirm_my_age_from_signup()', 'execute'), '2f anon from_signup';
  assert not has_function_privilege('anon', 'public.get_my_age_status()', 'execute'), '2g anon status';
  assert not has_function_privilege('anon', 'public.admin_set_age_declined(uuid, boolean)', 'execute'), '2h anon admin';
  assert pinhunt_minimum_age() = 18, '2i threshold is not 18';
end $$;

-- 3. Throwaway accounts
--   a: adult, b: under 18, c: signed up with the metadata flag,
--   d: admin, e: second admin, f: App Creator (if the trigger lets us)
insert into auth.users (id, raw_user_meta_data) values
  ('07200000-0000-4000-8000-0000000000a1', '{}'),
  ('07200000-0000-4000-8000-0000000000b2', '{}'),
  ('07200000-0000-4000-8000-0000000000c3', '{"age_confirmed": true}'),
  ('07200000-0000-4000-8000-0000000000d4', '{}'),
  ('07200000-0000-4000-8000-0000000000e5', '{}'),
  ('07200000-0000-4000-8000-0000000000f6', '{"age_confirmed": "yes"}');
insert into profiles (id) values
  ('07200000-0000-4000-8000-0000000000a1'), ('07200000-0000-4000-8000-0000000000b2'),
  ('07200000-0000-4000-8000-0000000000c3'), ('07200000-0000-4000-8000-0000000000d4'),
  ('07200000-0000-4000-8000-0000000000e5'), ('07200000-0000-4000-8000-0000000000f6')
  on conflict (id) do nothing;
-- The privilege guard only lets the console set this, which is what this is.
update profiles set is_admin = true
 where id in ('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e5');

do $$
declare
  a uuid := '07200000-0000-4000-8000-0000000000a1';
  b uuid := '07200000-0000-4000-8000-0000000000b2';
  c uuid := '07200000-0000-4000-8000-0000000000c3';
  d uuid := '07200000-0000-4000-8000-0000000000d4';
  e uuid := '07200000-0000-4000-8000-0000000000e5';
  f uuid := '07200000-0000-4000-8000-0000000000f6';
  today date := (now() at time zone 'Etc/GMT-14')::date;
  v text;
  ok boolean;
begin
  -- 3a. New accounts start unconfirmed.
  perform pg_temp.v072_as(a);
  set local role authenticated;
  assert get_my_age_status() = 'unconfirmed', '3a new account not unconfirmed';

  -- 3b. A client can't read or write the columns directly, even its own row.
  begin
    perform age_confirmed_at from profiles where id = a;
    assert false, '3b own row column readable';
  exception when insufficient_privilege then null;
  end;
  begin
    update profiles set age_confirmed_at = now() where id = a;
    assert false, '3c own row column writable';
  exception when insufficient_privilege then null;
  end;

  -- 3d. Invalid dates are refused and change nothing.
  begin
    perform confirm_my_age(today + 1);
    assert false, '3d future date accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform confirm_my_age(null);
    assert false, '3e null date accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform confirm_my_age(date '1899-12-31');
    assert false, '3f 1899 accepted';
  exception when invalid_parameter_value then null;
  end;
  assert get_my_age_status() = 'unconfirmed', '3g invalid date changed the status';

  -- 3h. 18th birthday today: confirmed.
  v := confirm_my_age((today - interval '18 years')::date);
  assert v = 'confirmed', format('3h 18th birthday today gave %s', v);
  assert get_my_age_status() = 'confirmed', '3i status after confirm';
  -- Confirming again is harmless.
  assert confirm_my_age((today - interval '30 years')::date) = 'confirmed', '3j repeat confirm';

  -- 3k. One day short of 18: declined, and stays declined.
  perform pg_temp.v072_as(b);
  v := confirm_my_age((today - interval '18 years' + interval '1 day')::date);
  assert v = 'declined', format('3k under 18 gave %s', v);
  assert get_my_age_status() = 'declined', '3l status after decline';
  begin
    perform confirm_my_age(date '1980-01-01');
    assert false, '3m declined account could retry';
  exception when insufficient_privilege then null;
  end;
  begin
    perform confirm_my_age_from_signup();
    assert false, '3n declined account could retry via sign-up';
  exception when insufficient_privilege then null;
  end;

  -- 3o. Sign-up metadata flag confirms; no flag or a bad value doesn't.
  perform pg_temp.v072_as(c);
  assert confirm_my_age_from_signup() = 'confirmed', '3o metadata flag did not confirm';
  perform pg_temp.v072_as(d);
  assert confirm_my_age_from_signup() = 'unconfirmed', '3p no flag confirmed';
  perform pg_temp.v072_as(f);
  assert confirm_my_age_from_signup() = 'unconfirmed', '3q non-boolean flag confirmed';

  -- 3r. Non-admins can't use the admin function.
  perform pg_temp.v072_as(a);
  begin
    perform admin_set_age_declined(c, true);
    assert false, '3r non-admin declined someone';
  exception when insufficient_privilege then null;
  end;

  -- 3s. Admin closes a confirmed account as under 18, then undoes it.
  perform pg_temp.v072_as(d);
  perform admin_set_age_declined(c, true);
  perform pg_temp.v072_as(c);
  assert get_my_age_status() = 'declined', '3s admin decline not applied';
  perform pg_temp.v072_as(d);
  perform admin_set_age_declined(c, false);
  perform pg_temp.v072_as(c);
  assert get_my_age_status() = 'confirmed', '3t undo did not restore confirmed';

  -- 3u. Undo on a self-declined account lets them confirm again.
  perform pg_temp.v072_as(d);
  perform admin_set_age_declined(b, false);
  perform pg_temp.v072_as(b);
  assert get_my_age_status() = 'unconfirmed', '3u undo on self-declined';

  -- 3v. Limits: not yourself, not another admin (unless App Creator).
  perform pg_temp.v072_as(d);
  begin
    perform admin_set_age_declined(d, true);
    assert false, '3v admin declined themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform admin_set_age_declined(e, true);
    assert false, '3w admin declined another admin';
  exception when insufficient_privilege then null;
  end;

  -- 3x. Signed out: nothing works.
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform confirm_my_age(date '1980-01-01');
    assert false, '3x anonymous confirm';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- 4. Other users can't see either column through any read path
do $$
declare
  a uuid := '07200000-0000-4000-8000-0000000000a1';
  c uuid := '07200000-0000-4000-8000-0000000000c3';
begin
  perform pg_temp.v072_as(c);
  set local role authenticated;
  begin
    perform age_declined_at from profiles where id = a;
    assert false, '4a another user''s column readable';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if to_regclass('public.public_profiles_safe') is not null then
    assert not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'public_profiles_safe'
        and column_name in ('age_confirmed_at', 'age_declined_at')
    ), '4b public_profiles_safe exposes an age column';
  end if;
end $$;

select 'ALL 072 CHECKS PASSED' as result;

rollback;
