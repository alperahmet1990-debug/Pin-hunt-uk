-- ============================================================
-- Verification for migration 057 (run on STAGING after applying 057, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates four throwaway auth
-- users, so it leaves nothing behind. Expected final output: a single row
-- 'ALL 057 CHECKS PASSED'. Any failed check aborts with an error naming it.
--
--   A …a1 initiator   B …b2 recipient   C …c3 bystander   D …d4 suspended
-- ============================================================
begin;

create or replace function pg_temp.v057_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- True when p_sql fails as user p_uid, optionally with p_like in the message.
create or replace function pg_temp.v057_refused(p_uid uuid, p_sql text, p_like text default null)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  perform pg_temp.v057_as(p_uid);
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

create or replace function pg_temp.v057_ok(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_temp.v057_as(p_uid);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

-- 1. Shape and grants
do $$
declare f text;
begin
  assert not has_table_privilege('authenticated', 'public.trades', 'update'), '1a authenticated can update trades';
  assert not has_table_privilege('authenticated', 'public.trades', 'insert'), '1b authenticated can insert trades';
  assert not has_table_privilege('anon', 'public.trades', 'update'), '1c anon can update trades';
  assert has_table_privilege('authenticated', 'public.trades', 'select'), '1d authenticated cannot read trades';
  assert not exists (select 1 from pg_policies where tablename = 'trades' and policyname in
    ('trades_insert_auth', 'trades_update_participant')), '1e old write policy still present';
  foreach f in array array['trade_propose(uuid,text)', 'trade_accept(uuid)', 'trade_decline(uuid)',
                           'trade_cancel(uuid)', 'trade_mark_posted(uuid,text,text)',
                           'trade_mark_received(uuid)', 'trade_report_problem(uuid)'] loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute'), format('1f anon can run %s', f);
    assert has_function_privilege('authenticated', 'public.' || f, 'execute'), format('1g cannot run %s', f);
  end loop;
  foreach f in array array['trade_for_participant(uuid)', 'trade_assert_may_commit(uuid)'] loop
    assert not has_function_privilege('authenticated', 'public.' || f, 'execute'), format('1h helper exposed: %s', f);
    assert not has_function_privilege('anon', 'public.' || f, 'execute'), format('1i helper exposed: %s', f);
  end loop;
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'trade\_%' and p.prosecdef
      and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ), '1j a trade function has no search_path';
end $$;

-- 2. Test data
insert into auth.users (id) values
  ('05700000-0000-4000-8000-0000000000a1'), ('05700000-0000-4000-8000-0000000000b2'),
  ('05700000-0000-4000-8000-0000000000c3'), ('05700000-0000-4000-8000-0000000000d4');
insert into profiles (id) values
  ('05700000-0000-4000-8000-0000000000a1'), ('05700000-0000-4000-8000-0000000000b2'),
  ('05700000-0000-4000-8000-0000000000c3'), ('05700000-0000-4000-8000-0000000000d4')
  on conflict (id) do nothing;
insert into user_suspensions (user_id, suspended_by)
  values ('05700000-0000-4000-8000-0000000000d4', '05700000-0000-4000-8000-0000000000c3');

create temp table v057 (k text primary key, id uuid);
grant all on v057 to authenticated;

do $$
declare
  a uuid := '05700000-0000-4000-8000-0000000000a1';
  b uuid := '05700000-0000-4000-8000-0000000000b2';
  c uuid := '05700000-0000-4000-8000-0000000000c3';
  d uuid := '05700000-0000-4000-8000-0000000000d4';
  t uuid;
  r trades;
  -- Starts a pending trade A -> B and returns its id.
begin
  -- Direct writes are refused
  assert pg_temp.v057_refused(a, format('insert into trades (initiator_id, recipient_id, status) values (%L, %L, ''completed'')', a, b)), '2a direct insert allowed';

  -- Propose
  perform pg_temp.v057_as(a);
  set local role authenticated;
  select (trade_propose(b, ' Swap? ')).id into t;
  reset role;
  assert (select status from trades where id = t) = 'pending', '2b not pending';
  assert (select notes from trades where id = t) = 'Swap?', '2c notes not trimmed';
  assert pg_temp.v057_refused(a, format('select trade_propose(%L)', a)), '2d proposed to self';
  assert pg_temp.v057_refused(d, format('select trade_propose(%L)', b)), '2e suspended user proposed';

  -- Direct updates are refused, for either side and any status
  assert pg_temp.v057_refused(a, format('update trades set status = ''completed'' where id = %L', t), 'permission denied'), '3a direct update allowed';
  assert pg_temp.v057_refused(b, format('update trades set status = ''accepted'' where id = %L', t), 'permission denied'), '3b direct update allowed';

  -- Only the recipient accepts or declines
  assert pg_temp.v057_refused(a, format('select trade_accept(%L)', t)), '4a initiator accepted';
  assert pg_temp.v057_refused(a, format('select trade_decline(%L)', t)), '4b initiator declined';
  assert pg_temp.v057_refused(c, format('select trade_accept(%L)', t), 'not found'), '4c bystander accepted';
  assert pg_temp.v057_refused(b, format('select trade_cancel(%L)', t)), '4d recipient cancelled pending';

  -- Nothing skips acceptance
  assert pg_temp.v057_refused(a, format('select trade_mark_posted(%L)', t)), '5a posted before accepted';
  assert pg_temp.v057_refused(b, format('select trade_mark_received(%L)', t)), '5b received before accepted';
  assert pg_temp.v057_refused(a, format('select trade_report_problem(%L)', t)), '5c problem before accepted';

  -- Accept, then a block stops posting but not leaving
  perform pg_temp.v057_ok(b, format('select trade_accept(%L)', t));
  assert (select status from trades where id = t) = 'accepted', '6a not accepted';
  assert pg_temp.v057_refused(b, format('select trade_accept(%L)', t)), '6b accepted twice';
  assert pg_temp.v057_refused(b, format('select trade_mark_received(%L)', t), 'posted'), '6c received before other posted';
  assert pg_temp.v057_refused(a, format('select trade_report_problem(%L)', t)), '6d problem before posting';

  insert into user_blocks (blocker_id, blocked_id) values (a, b);
  assert pg_temp.v057_refused(a, format('select trade_mark_posted(%L)', t)), '6e posted while blocked';
  assert pg_temp.v057_refused(a, format('select trade_propose(%L)', b)), '6f proposed while blocked';
  delete from user_blocks where blocker_id = a and blocked_id = b;

  -- Posting is per side and keeps the first date
  perform pg_temp.v057_ok(a, format('select trade_mark_posted(%L, %L, %L)', t, ' Royal Mail ', 'AB123'));
  select * into r from trades where id = t;
  assert r.initiator_posted_at is not null and r.recipient_posted_at is null, '7a posted the wrong side';
  assert r.initiator_carrier = 'Royal Mail' and r.initiator_tracking = 'AB123', '7b tracking not stored';
  perform pg_temp.v057_ok(a, format('select trade_mark_posted(%L, null, %L)', t, 'CD456'));
  assert (select initiator_posted_at from trades where id = t) = r.initiator_posted_at, '7c posted date moved';
  assert (select initiator_carrier from trades where id = t) = 'Royal Mail', '7d carrier lost';
  assert (select initiator_tracking from trades where id = t) = 'CD456', '7e tracking not updated';
  assert pg_temp.v057_refused(a, format('select trade_cancel(%L)', t), 'post'), '7f cancelled after posting';
  assert pg_temp.v057_refused(b, format('select trade_cancel(%L)', t), 'post'), '7g cancelled after posting';
  assert pg_temp.v057_refused(a, format('select trade_mark_received(%L)', t), 'posted'), '7h received before other posted';

  -- Receiving is per side; one mark doesn't complete
  perform pg_temp.v057_ok(b, format('select trade_mark_posted(%L)', t));
  perform pg_temp.v057_ok(b, format('select trade_mark_received(%L)', t));
  select * into r from trades where id = t;
  assert r.status = 'accepted', '8a completed on one mark';
  assert r.recipient_received_at is not null and r.initiator_received_at is null, '8b received the wrong side';

  -- A block can't trap pins already in the post
  insert into user_blocks (blocker_id, blocked_id) values (b, a);
  perform pg_temp.v057_ok(a, format('select trade_mark_received(%L)', t));
  delete from user_blocks where blocker_id = b and blocked_id = a;
  assert (select status from trades where id = t) = 'completed', '8c not completed on both marks';

  -- Finished trades don't move
  assert pg_temp.v057_refused(a, format('select trade_cancel(%L)', t)), '9a cancelled a completed trade';
  assert pg_temp.v057_refused(a, format('select trade_report_problem(%L)', t)), '9b problem on a completed trade';
  assert pg_temp.v057_refused(b, format('select trade_accept(%L)', t)), '9c accepted a completed trade';

  -- Decline, cancel from pending, cancel from accepted, problem
  perform pg_temp.v057_as(a); set local role authenticated;
  select (trade_propose(b)).id into t; reset role;
  perform pg_temp.v057_ok(b, format('select trade_decline(%L)', t));
  assert (select status from trades where id = t) = 'rejected', '10a not declined';

  perform pg_temp.v057_as(a); set local role authenticated;
  select (trade_propose(b)).id into t; reset role;
  perform pg_temp.v057_ok(a, format('select trade_cancel(%L)', t));
  assert (select status from trades where id = t) = 'cancelled', '10b not cancelled';

  perform pg_temp.v057_as(a); set local role authenticated;
  select (trade_propose(b)).id into t; reset role;
  perform pg_temp.v057_ok(b, format('select trade_accept(%L)', t));
  perform pg_temp.v057_ok(b, format('select trade_cancel(%L)', t));
  assert (select status from trades where id = t) = 'cancelled', '10c not cancelled after accept';

  perform pg_temp.v057_as(a); set local role authenticated;
  select (trade_propose(b)).id into t; reset role;
  perform pg_temp.v057_ok(b, format('select trade_accept(%L)', t));
  perform pg_temp.v057_ok(a, format('select trade_mark_posted(%L)', t));
  assert pg_temp.v057_refused(c, format('select trade_report_problem(%L)', t), 'not found'), '10d bystander reported';
  perform pg_temp.v057_ok(b, format('select trade_report_problem(%L)', t));
  select * into r from trades where id = t;
  assert r.status = 'problem' and r.problem_reported_by = b and r.problem_reported_at is not null, '10e problem not recorded';
  assert pg_temp.v057_refused(a, format('select trade_mark_received(%L)', t)), '10f received after problem';

  -- Signed-out callers
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  set local role authenticated;
  begin
    perform trade_propose(b);
    reset role;
    raise exception '11a signed-out propose allowed';
  exception when others then
    reset role;
    if sqlerrm like '11a%' then raise; end if;
  end;
end $$;

select 'ALL 057 CHECKS PASSED' as result;
rollback;
