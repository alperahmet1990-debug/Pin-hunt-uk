-- ============================================================
-- Verification for migration 058 (run on STAGING after applying 058, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users, so
-- it leaves nothing behind. Expected final output: a single row
-- 'ALL 058 CHECKS PASSED'. Any failed check aborts with an error naming it.
--
--   A …a1  B …b2  C …c3 bystander  D …d4 suspended
-- ============================================================
begin;

create or replace function pg_temp.v058_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v058_refused(p_uid uuid, p_sql text, p_like text default null)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  perform pg_temp.v058_as(p_uid);
  begin
    set local role authenticated;
    execute p_sql;
    reset role;
    return false;
  exception when others then
    v_msg := sqlerrm;
    reset role;
    return p_like is null or v_msg ilike '%' || p_like || '%';
  end;
end $$;

create or replace function pg_temp.v058_ok(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_temp.v058_as(p_uid);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

-- 1. Grants and policies
do $$
declare t text; p text;
begin
  foreach t in array array['trades', 'trade_items', 'trade_ratings'] loop
    foreach p in array array['insert', 'update', 'delete', 'truncate'] loop
      assert not has_table_privilege('authenticated', 'public.' || t, p), format('1a authenticated can %s %s', p, t);
      assert not has_table_privilege('anon', 'public.' || t, p), format('1b anon can %s %s', p, t);
    end loop;
    assert has_table_privilege('authenticated', 'public.' || t, 'select'), format('1c cannot read %s', t);
    assert not has_table_privilege('anon', 'public.' || t, 'select'), format('1d anon can read %s', t);
  end loop;
  assert not exists (select 1 from pg_policies where policyname in
    ('ratings_insert_own', 'trade_items_insert_participant', 'trade_items_delete_initiator')), '1e old policy remains';
  assert exists (select 1 from pg_policies where policyname = 'ratings_select_auth'), '1f ratings read policy lost';
  assert not has_function_privilege('anon', 'public.trade_rate(uuid,boolean,text)', 'execute'), '1g anon can rate';
  assert has_function_privilege('authenticated', 'public.trade_rate(uuid,boolean,text)', 'execute'), '1h cannot rate';
  assert not has_function_privilege('authenticated', 'public.trade_assert_may_commit(uuid)', 'execute'), '1i helper exposed';
  assert not exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public' and pr.proname = 'trade_rate'
      and not exists (select 1 from unnest(pr.proconfig) c where c like 'search_path=%')
  ), '1j trade_rate has no search_path';
end $$;

-- 2. Test data
insert into auth.users (id) values
  ('05800000-0000-4000-8000-0000000000a1'), ('05800000-0000-4000-8000-0000000000b2'),
  ('05800000-0000-4000-8000-0000000000c3'), ('05800000-0000-4000-8000-0000000000d4');
insert into profiles (id) values
  ('05800000-0000-4000-8000-0000000000a1'), ('05800000-0000-4000-8000-0000000000b2'),
  ('05800000-0000-4000-8000-0000000000c3'), ('05800000-0000-4000-8000-0000000000d4')
  on conflict (id) do nothing;
insert into user_suspensions (user_id, suspended_by)
  values ('05800000-0000-4000-8000-0000000000d4', '05800000-0000-4000-8000-0000000000c3');
insert into pins (id, pinhunt_id, title, brand, collection, verification_status) values
  ('05800000-0000-4000-8000-00000000f001', 'PHUK-VERIFY58A', 'Verify 058 pin', 'Disney', '', 'verified');
insert into user_pins (id, user_id, pin_id, status) values
  ('05800000-0000-4000-8000-00000000e001', '05800000-0000-4000-8000-0000000000b2',
   '05800000-0000-4000-8000-00000000f001', 'for_trade');

do $$
declare
  a uuid := '05800000-0000-4000-8000-0000000000a1';
  b uuid := '05800000-0000-4000-8000-0000000000b2';
  c uuid := '05800000-0000-4000-8000-0000000000c3';
  d uuid := '05800000-0000-4000-8000-0000000000d4';
  pin uuid := '05800000-0000-4000-8000-00000000e001';
  t_done uuid := '05800000-0000-4000-8000-00000000c001';
  t_done2 uuid := '05800000-0000-4000-8000-00000000c002';
  t_open uuid := '05800000-0000-4000-8000-00000000c003';
  t_acc uuid := '05800000-0000-4000-8000-00000000c004';
  t_from_d uuid := '05800000-0000-4000-8000-00000000c005';
  t_acc_d uuid := '05800000-0000-4000-8000-00000000c006';
  t_susp uuid := '05800000-0000-4000-8000-00000000c007';
  r trade_ratings;
begin
  insert into trades (id, initiator_id, recipient_id, status) values
    (t_done, a, b, 'completed'), (t_done2, a, b, 'completed'), (t_open, a, b, 'pending'),
    (t_acc, a, b, 'accepted'), (t_from_d, d, a, 'pending'), (t_acc_d, d, a, 'accepted'),
    (t_susp, d, b, 'completed');

  -- Ratings: only through the function, only on a completed trade
  assert pg_temp.v058_refused(a, format('insert into trade_ratings (trade_id, rater_id, ratee_id, is_positive) values (%L, %L, %L, false)', t_done, a, b), 'permission denied'), '2a direct rating allowed';
  assert pg_temp.v058_refused(a, format('insert into trade_ratings (rater_id, ratee_id, is_positive) values (%L, %L, false)', a, c), 'permission denied'), '2b standalone rating allowed';
  assert pg_temp.v058_refused(a, format('select trade_rate(%L, true)', t_open), 'completed'), '2c rated a pending trade';
  assert pg_temp.v058_refused(a, format('select trade_rate(%L, true)', t_acc), 'completed'), '2d rated an accepted trade';
  assert pg_temp.v058_refused(c, format('select trade_rate(%L, true)', t_done), 'not found'), '2e bystander rated';
  assert pg_temp.v058_refused(a, format('select trade_rate(%L, true, %L)', t_done, repeat('x', 501))), '2f long comment allowed';
  assert pg_temp.v058_refused(a, format('select trade_rate(%L, null)', t_done)), '2g empty rating allowed';
  assert pg_temp.v058_refused(d, format('select trade_rate(%L, true)', t_susp)), '2h suspended user rated';

  perform pg_temp.v058_ok(a, format('select trade_rate(%L, true, %L)', t_done, ' Great '));
  select * into r from trade_ratings where trade_id = t_done and rater_id = a;
  assert r.ratee_id = b, '2i wrong person rated';
  assert r.comment = 'Great', '2j comment not trimmed';
  assert pg_temp.v058_refused(a, format('select trade_rate(%L, false)', t_done), 'already rated'), '2k rated twice';
  perform pg_temp.v058_ok(b, format('select trade_rate(%L, true)', t_done));
  assert (select count(*) from trade_ratings where trade_id = t_done) = 2, '2l each side rates once';

  -- Removing rated trades doesn't collide
  perform pg_temp.v058_ok(a, format('select trade_rate(%L, true)', t_done2));
  delete from trades where id in (t_done, t_done2);
  assert (select count(*) from trade_ratings where rater_id = a and trade_id is null) = 2, '2m ratings not kept';

  -- A suspended counterparty
  assert pg_temp.v058_refused(a, format('select trade_accept(%L)', t_from_d), 'available'), '3a accepted from suspended user';
  perform pg_temp.v058_ok(a, format('select trade_decline(%L)', t_from_d));
  assert (select status from trades where id = t_from_d) = 'rejected', '3b could not decline';
  assert pg_temp.v058_refused(a, format('select trade_propose(%L)', d), 'available'), '3c proposed to suspended user';
  assert pg_temp.v058_refused(a, format('select trade_mark_posted(%L)', t_acc_d), 'available'), '3d posted to suspended user';
  perform pg_temp.v058_ok(a, format('select trade_cancel(%L)', t_acc_d));
  assert (select status from trades where id = t_acc_d) = 'cancelled', '3e could not cancel';

  -- Tracking after posting isn't a new commitment; a first post still is
  perform pg_temp.v058_ok(a, format('select trade_mark_posted(%L)', t_acc));
  insert into user_blocks (blocker_id, blocked_id) values (b, a);
  perform pg_temp.v058_ok(a, format('select trade_mark_posted(%L, null, %L)', t_acc, 'AB1'));
  assert (select initiator_tracking from trades where id = t_acc) = 'AB1', '4a tracking not saved';
  assert pg_temp.v058_refused(b, format('select trade_mark_posted(%L)', t_acc), 'available'), '4b first post allowed while blocked';
  delete from user_blocks where blocker_id = b and blocked_id = a;

  -- trade_items: no client writes, reads unchanged
  assert pg_temp.v058_refused(a, format('insert into trade_items (trade_id, user_pin_id, direction) values (%L, %L, ''requested'')', t_open, pin), 'permission denied'), '5a client wrote trade_items';
  insert into trade_items (trade_id, user_pin_id, direction) values (t_open, pin, 'requested');
  assert pg_temp.v058_refused(a, format('delete from trade_items where trade_id = %L', t_open), 'permission denied'), '5b client deleted trade_items';
  perform pg_temp.v058_as(a);
  set local role authenticated;
  assert (select count(*) from trade_items where trade_id = t_open) = 1, '5c participant cannot read items';
  perform pg_temp.v058_as(c);
  assert (select count(*) from trade_items where trade_id = t_open) = 0, '5d bystander reads items';
  reset role;
end $$;

select 'ALL 058 CHECKS PASSED' as result;
rollback;
