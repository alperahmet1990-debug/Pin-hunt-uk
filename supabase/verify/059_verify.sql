-- ============================================================
-- Verification for migration 059 (run on STAGING after applying 059, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users, so
-- it leaves nothing behind. Expected final output: a single row
-- 'ALL 059 CHECKS PASSED'. Any failed check aborts with an error naming it.
--
--   A …a1  B …b2 traders   C …c3 bystander   D …d4 admin   E …e5 admin, also a trader
-- ============================================================
begin;

create or replace function pg_temp.v059_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v059_refused(p_uid uuid, p_sql text, p_like text default null)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  perform pg_temp.v059_as(p_uid);
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

create or replace function pg_temp.v059_ok(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_temp.v059_as(p_uid);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

-- 1. Grants
do $$
declare f text;
begin
  foreach f in array array['trade_report_problem(uuid,text)', 'admin_list_problem_trades()',
                           'admin_resolve_trade_problem(uuid,text,text)'] loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute'), format('1a anon can run %s', f);
    assert has_function_privilege('authenticated', 'public.' || f, 'execute'), format('1b cannot run %s', f);
  end loop;
  assert to_regprocedure('public.trade_report_problem(uuid)') is null, '1c old function remains';
  assert not has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'execute'), '1d clients can prepare deletion';
  assert not has_table_privilege('authenticated', 'public.trades', 'update'), '1e trades writable';
  assert not exists (select 1 from pg_policies where tablename = 'trades' and qual ilike '%is_admin%'), '1f wider admin read';
end $$;

-- 2. Test data
insert into auth.users (id) values
  ('05900000-0000-4000-8000-0000000000a1'), ('05900000-0000-4000-8000-0000000000b2'),
  ('05900000-0000-4000-8000-0000000000c3'), ('05900000-0000-4000-8000-0000000000d4'),
  ('05900000-0000-4000-8000-0000000000e5');
insert into profiles (id) values
  ('05900000-0000-4000-8000-0000000000a1'), ('05900000-0000-4000-8000-0000000000b2'),
  ('05900000-0000-4000-8000-0000000000c3'), ('05900000-0000-4000-8000-0000000000d4'),
  ('05900000-0000-4000-8000-0000000000e5')
  on conflict (id) do nothing;
-- The privilege guard only lets the console set this, which is what this is.
update profiles set is_admin = true where id in
  ('05900000-0000-4000-8000-0000000000d4', '05900000-0000-4000-8000-0000000000e5');

do $$
declare
  a uuid := '05900000-0000-4000-8000-0000000000a1';
  b uuid := '05900000-0000-4000-8000-0000000000b2';
  c uuid := '05900000-0000-4000-8000-0000000000c3';
  d uuid := '05900000-0000-4000-8000-0000000000d4';
  e uuid := '05900000-0000-4000-8000-0000000000e5';
  t1 uuid := '05900000-0000-4000-8000-00000000c001';
  t2 uuid := '05900000-0000-4000-8000-00000000c002';
  t3 uuid := '05900000-0000-4000-8000-00000000c003';
  t4 uuid := '05900000-0000-4000-8000-00000000c004';
  n integer;
  r jsonb;
begin
  insert into trades (id, initiator_id, recipient_id, status, initiator_posted_at) values
    (t1, a, b, 'accepted', now()), (t2, a, b, 'accepted', now()),
    (t3, a, b, 'accepted', null),  (t4, e, b, 'accepted', now());

  -- A reason is required, and only after posting
  assert pg_temp.v059_refused(a, format('select trade_report_problem(%L, null)', t1), 'went wrong'), '2a no reason';
  assert pg_temp.v059_refused(a, format('select trade_report_problem(%L, %L)', t1, '   '), 'went wrong'), '2b blank reason';
  assert pg_temp.v059_refused(a, format('select trade_report_problem(%L, %L)', t1, repeat('x', 501))), '2c long reason';
  assert pg_temp.v059_refused(a, format('select trade_report_problem(%L, %L)', t3, 'x'), 'posted'), '2d before posting';
  assert pg_temp.v059_refused(c, format('select trade_report_problem(%L, %L)', t1, 'x'), 'not found'), '2e bystander';

  -- Deletion waits while a trade is accepted
  r := prepare_account_deletion(b);
  assert r->>'status' = 'refused' and r->>'reason' = 'open_trade', '3a deletion not refused for accepted';
  assert exists (select 1 from trades where id = t1), '3b trade removed by refusal';

  perform pg_temp.v059_ok(b, format('select trade_report_problem(%L, %L)', t1, ' Pin never arrived '));
  assert (select status from trades where id = t1) = 'problem', '4a not problem';
  assert (select problem_reason from trades where id = t1) = 'Pin never arrived', '4b reason not stored';
  assert (select problem_reported_by from trades where id = t1) = b, '4c reporter wrong';
  perform pg_temp.v059_ok(e, format('select trade_report_problem(%L, %L)', t4, 'Own trade'));
  perform pg_temp.v059_ok(a, format('select trade_report_problem(%L, %L)', t2, 'Second'));

  -- Only admins read or close reports
  assert pg_temp.v059_refused(a, 'select * from admin_list_problem_trades()', 'admins only'), '5a trader listed';
  assert pg_temp.v059_refused(c, 'select * from admin_list_problem_trades()', 'admins only'), '5b bystander listed';
  assert pg_temp.v059_refused(a, format('select admin_resolve_trade_problem(%L, %L)', t1, 'completed'), 'admins only'), '5c trader closed';
  perform pg_temp.v059_as(d);
  set local role authenticated;
  select count(*) into n from admin_list_problem_trades();
  reset role;
  assert n >= 3, '5d admin sees reports';
  assert pg_temp.v059_refused(d, format('select admin_resolve_trade_problem(%L, %L)', t1, 'accepted'), 'choose'), '5e bad outcome';
  assert pg_temp.v059_refused(d, format('select admin_resolve_trade_problem(%L, %L)', t3, 'cancelled'), 'closed'), '5f closed an accepted trade';
  assert pg_temp.v059_refused(e, format('select admin_resolve_trade_problem(%L, %L)', t4, 'completed'), 'another admin'), '5g admin closed own trade';
  perform pg_temp.v059_ok(e, format('select admin_resolve_trade_problem(%L, %L)', t1, 'cancelled'));
  perform pg_temp.v059_ok(d, format('select admin_resolve_trade_problem(%L, %L, %L)', t2, 'completed', 'Confirmed'));
  assert pg_temp.v059_refused(d, format('select admin_resolve_trade_problem(%L, %L)', t2, 'cancelled'), 'closed'), '5h closed twice';
  assert (select status from trades where id = t2) = 'completed', '5i not completed';
  assert (select problem_resolved_by from trades where id = t2) = d, '5j resolver not stored';
  assert (select problem_resolution_note from trades where id = t2) = 'Confirmed', '5k note not stored';
  assert (select status from trades where id = t1) = 'cancelled', '5l not cancelled';
  assert (select problem_reason from trades where id = t1) = 'Pin never arrived', '5m reason lost';

  -- With only a problem trade left, deletion is still held, then proceeds
  perform pg_temp.v059_ok(a, format('select trade_cancel(%L)', t3));
  assert not exists (select 1 from trades where recipient_id = b and status = 'accepted'), '6z setup';
  r := prepare_account_deletion(b);
  assert r->>'reason' = 'open_trade', '6a problem trade did not hold deletion';
  perform pg_temp.v059_ok(d, format('select admin_resolve_trade_problem(%L, %L)', t4, 'cancelled'));
  r := prepare_account_deletion(b);
  assert r->>'status' = 'ready', '6b deletion still refused';
  insert into trades (initiator_id, recipient_id, status) values (a, c, 'pending');
  r := prepare_account_deletion(c);
  assert r->>'status' = 'ready', '6c pending trade held deletion';
end $$;

select 'ALL 059 CHECKS PASSED' as result;
rollback;
