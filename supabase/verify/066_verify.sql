-- ============================================================
-- Verification for migration 066 (run on STAGING after applying 066, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users, so
-- it leaves nothing behind. Expected final output: a single row
-- 'ALL 066 CHECKS PASSED'. Any failed check aborts with an error naming it.
--
--   A …a1 open to everything   B …b2 no new messages
--   C …c3 no trade requests    D …d4 private profile, open to everything
-- ============================================================
begin;

create or replace function pg_temp.v066_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v066_refused(p_uid uuid, p_sql text, p_like text default null)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  perform pg_temp.v066_as(p_uid);
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

create or replace function pg_temp.v066_ok(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_temp.v066_as(p_uid);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

create or replace function pg_temp.v066_prefs(p_viewer uuid, p_user uuid)
returns table (m boolean, t boolean) language plpgsql as $$
begin
  perform pg_temp.v066_as(p_viewer);
  set local role authenticated;
  return query select accepts_messages, accepts_trade_requests from collector_contact_preferences(p_user);
  reset role;
end $$;

do $$
begin
  assert not has_function_privilege('anon', 'public.collector_contact_preferences(uuid)', 'execute'), '1a anon can read preferences';
  assert has_function_privilege('authenticated', 'public.collector_contact_preferences(uuid)', 'execute'), '1b cannot read preferences';
  assert not has_function_privilege('authenticated', 'public.conversations_check_contact_preference()', 'execute'), '1c trigger function exposed';
  assert not has_function_privilege('anon', 'public.trade_propose(uuid,text)', 'execute'), '1d anon can propose';
  assert has_function_privilege('authenticated', 'public.trade_propose(uuid,text)', 'execute'), '1e cannot propose';
  assert exists (select 1 from pg_trigger where tgname = 'conversations_check_contact_preference' and not tgisinternal), '1f trigger missing';
end $$;

insert into auth.users (id) values
  ('06600000-0000-4000-8000-0000000000a1'), ('06600000-0000-4000-8000-0000000000b2'),
  ('06600000-0000-4000-8000-0000000000c3'), ('06600000-0000-4000-8000-0000000000d4');
insert into profiles (id) values
  ('06600000-0000-4000-8000-0000000000a1'), ('06600000-0000-4000-8000-0000000000b2'),
  ('06600000-0000-4000-8000-0000000000c3'), ('06600000-0000-4000-8000-0000000000d4')
  on conflict (id) do nothing;
update profiles set allow_messages = true, allow_trade_requests = true, profile_visibility = 'public'
  where id in ('06600000-0000-4000-8000-0000000000a1', '06600000-0000-4000-8000-0000000000b2',
               '06600000-0000-4000-8000-0000000000c3', '06600000-0000-4000-8000-0000000000d4');
update profiles set allow_messages = false where id = '06600000-0000-4000-8000-0000000000b2';
update profiles set allow_trade_requests = false where id = '06600000-0000-4000-8000-0000000000c3';
update profiles set profile_visibility = 'private' where id = '06600000-0000-4000-8000-0000000000d4';

do $$
declare
  a uuid := '06600000-0000-4000-8000-0000000000a1';
  b uuid := '06600000-0000-4000-8000-0000000000b2';
  c uuid := '06600000-0000-4000-8000-0000000000c3';
  d uuid := '06600000-0000-4000-8000-0000000000d4';
  conv_ab uuid := '06600000-0000-4000-8000-00000000c0ab';
  r record;
begin
  -- Preferences are readable for any collector, including private profiles
  select * into r from pg_temp.v066_prefs(a, b);
  assert r.m = false and r.t = true, '2a B preferences wrong';
  select * into r from pg_temp.v066_prefs(a, c);
  assert r.m = true and r.t = false, '2b C preferences wrong';
  select * into r from pg_temp.v066_prefs(a, d);
  assert r.m = true and r.t = true, '2c private D preferences wrong';
  select * into r from pg_temp.v066_prefs(a, '06600000-0000-4000-8000-0000000000ff');
  assert r.m = false and r.t = false, '2d unknown user should accept nothing';

  -- New chats need the other collector to allow messages
  assert pg_temp.v066_refused(a, format('insert into conversations (participant_a_id, participant_b_id) values (%L, %L)', a, b), 'new messages'), '3a chat started with B';
  perform pg_temp.v066_ok(a, format('insert into conversations (participant_a_id, participant_b_id) values (%L, %L)', a, c));
  perform pg_temp.v066_ok(a, format('insert into conversations (participant_a_id, participant_b_id) values (%L, %L)', a, d));
  perform pg_temp.v066_ok(b, format('insert into conversations (participant_a_id, participant_b_id) values (%L, %L)', b, a));

  -- An existing chat keeps working after messages are turned off
  insert into conversations (id, participant_a_id, participant_b_id) values (conv_ab, b, a);
  perform pg_temp.v066_ok(a, format('insert into conversation_messages (conversation_id, sender_id, body) values (%L, %L, %L)', conv_ab, a, 'Still here'));

  -- New proposals need the other collector to allow trade requests
  assert pg_temp.v066_refused(a, format('select trade_propose(%L)', c), 'trade requests'), '4a proposed to C';
  perform pg_temp.v066_ok(a, format('select trade_propose(%L)', b));
  perform pg_temp.v066_ok(c, format('select trade_propose(%L)', d));

  -- In-chat proposals follow the same rule
  assert pg_temp.v066_refused(a, format('select trade_propose_in_chat(%L)', (
    select id from conversations where participant_a_id = a and participant_b_id = c limit 1)), 'trade requests'), '4b proposed to C in chat';

  -- Service-role and SQL-editor inserts are not checked
  insert into conversations (participant_a_id, participant_b_id) values (c, b);
end $$;

select 'ALL 066 CHECKS PASSED' as result;
rollback;
