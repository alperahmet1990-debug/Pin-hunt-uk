-- ============================================================
-- Verification for migration 061 (run on STAGING after applying 061, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users, so
-- it leaves nothing behind. Expected final output: a single row
-- 'ALL 061 CHECKS PASSED'. Any failed check aborts with an error naming it.
--
--   A …a1  B …b2 in a chat   C …c3 stranger   D …d4 suspended
-- ============================================================
begin;

create or replace function pg_temp.v061_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v061_refused(p_uid uuid, p_sql text, p_like text default null)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  perform pg_temp.v061_as(p_uid);
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

create or replace function pg_temp.v061_ok(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_temp.v061_as(p_uid);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

do $$
begin
  assert not has_function_privilege('anon', 'public.trade_report_problem(uuid,text)', 'execute'), '1a anon can report';
  assert has_function_privilege('authenticated', 'public.trade_report_problem(uuid,text)', 'execute'), '1b cannot report';
  assert not has_function_privilege('anon', 'public.trade_propose(uuid,text)', 'execute'), '1c anon can propose';
  assert has_function_privilege('authenticated', 'public.trade_propose(uuid,text)', 'execute'), '1d cannot propose';
  assert not has_function_privilege('authenticated', 'public.trade_clean_text(text)', 'execute'), '1e helper exposed';
  assert not has_function_privilege('anon', 'public.trade_clean_text(text)', 'execute'), '1f helper exposed';
  assert has_function_privilege('authenticated', 'public.link_conversation_trade(uuid,uuid)', 'execute'), '1g cannot link';
  assert exists (select 1 from pg_policies where policyname = 'conversations_insert_no_trade_link' and permissive = 'RESTRICTIVE'), '1h policy missing';
end $$;

insert into auth.users (id) values
  ('06100000-0000-4000-8000-0000000000a1'), ('06100000-0000-4000-8000-0000000000b2'),
  ('06100000-0000-4000-8000-0000000000c3'), ('06100000-0000-4000-8000-0000000000d4');
insert into profiles (id) values
  ('06100000-0000-4000-8000-0000000000a1'), ('06100000-0000-4000-8000-0000000000b2'),
  ('06100000-0000-4000-8000-0000000000c3'), ('06100000-0000-4000-8000-0000000000d4')
  on conflict (id) do nothing;
insert into user_suspensions (user_id, suspended_by)
  values ('06100000-0000-4000-8000-0000000000d4', '06100000-0000-4000-8000-0000000000c3');

do $$
declare
  a uuid := '06100000-0000-4000-8000-0000000000a1';
  b uuid := '06100000-0000-4000-8000-0000000000b2';
  c uuid := '06100000-0000-4000-8000-0000000000c3';
  d uuid := '06100000-0000-4000-8000-0000000000d4';
  left_a uuid := '06100000-0000-4000-8000-00000000c0a0';
  left_b uuid := '06100000-0000-4000-8000-00000000c0b0';
  conv uuid := '06100000-0000-4000-8000-00000000c0c0';
  conv_d uuid := '06100000-0000-4000-8000-00000000c0d0';
  t uuid := '06100000-0000-4000-8000-00000000d001';
  t2 uuid := '06100000-0000-4000-8000-00000000d002';
  i integer;
begin
  -- A chat with a collector who has left refuses everyone
  insert into conversations (id, participant_a_id, participant_b_id) values
    (left_a, a, null), (left_b, null, a), (conv, a, b), (conv_d, a, d);
  insert into trades (id, initiator_id, recipient_id, status) values (t2, a, c, 'cancelled');
  assert pg_temp.v061_refused(c, format('select trade_propose_in_chat(%L)', left_a), 'not found'), '2a stranger proposed';
  assert pg_temp.v061_refused(a, format('select trade_propose_in_chat(%L)', left_a), 'not found'), '2b proposed to nobody';
  assert pg_temp.v061_refused(c, format('select link_conversation_trade(%L, %L)', left_a, t2), 'not found'), '2c stranger linked';
  assert pg_temp.v061_refused(c, format('select link_conversation_trade(%L, %L)', left_b, t2), 'not found'), '2d stranger linked';
  assert (select trade_id from conversations where id = left_a) is null, '2e link written';
  assert not exists (select 1 from trades where initiator_id = c), '2f trade created';

  -- Suspended people, through chat
  assert pg_temp.v061_refused(a, format('select trade_propose_in_chat(%L)', conv_d), 'available'), '3a proposed to suspended';
  assert pg_temp.v061_refused(d, format('select trade_propose_in_chat(%L)', conv_d)), '3b suspended proposed';

  -- One waiting proposal per pair, either way round
  perform pg_temp.v061_ok(a, format('select trade_propose(%L, %L)', b, E'Swap?\nPinHunt:​  ok'));
  assert (select notes from trades where initiator_id = a and recipient_id = b) = 'Swap? PinHunt: ok', '4a notes not cleaned';
  assert pg_temp.v061_refused(a, format('select trade_propose(%L)', b), 'already'), '4b second proposal';
  assert pg_temp.v061_refused(b, format('select trade_propose(%L)', a), 'already'), '4c reverse proposal';
  assert pg_temp.v061_refused(b, format('select trade_propose_in_chat(%L)', conv), 'already'), '4d proposal through chat';
  perform pg_temp.v061_ok(a, format('select trade_cancel(%L)', (select id from trades where initiator_id = a and recipient_id = b)));
  perform pg_temp.v061_ok(b, format('select trade_propose(%L)', a));

  -- A limit on waiting proposals
  for i in 1..20 loop
    insert into auth.users (id) values (gen_random_uuid());
  end loop;
  insert into trades (initiator_id, recipient_id)
    select c, u.id from auth.users u
    where u.id not in (a, b, c, d) and not exists (select 1 from profiles p where p.id = u.id and p.username is not null)
    limit 20;
  assert (select count(*) from trades where initiator_id = c and status = 'pending') = 20, '5z setup';
  assert pg_temp.v061_refused(c, format('select trade_propose(%L)', a), 'too many'), '5a past the limit';

  -- Reasons: plain text only
  update trades set status = 'cancelled' where initiator_id = b and recipient_id = a;
  insert into trades (id, initiator_id, recipient_id, status, initiator_posted_at) values (t, a, b, 'accepted', now());
  assert pg_temp.v061_refused(b, format('select trade_report_problem(%L, %L)', t, E'​⁠﻿'), 'went wrong'), '6a invisible reason';
  assert pg_temp.v061_refused(b, format('select trade_report_problem(%L, %L)', t, E'   　 '), 'went wrong'), '6b space-like reason';
  perform pg_temp.v061_ok(b, format('select trade_report_problem(%L, %L)', t, E'Lost PinHunt:‮  it\u0085now'));
  assert (select problem_reason from trades where id = t) = 'Lost PinHunt: it now', '6c reason not cleaned';

  -- New chats can't start with a trade
  assert pg_temp.v061_refused(a, format('insert into conversations (participant_a_id, participant_b_id, trade_id) values (%L, %L, %L)', a, c, t2)), '7a chat created with a trade';
  perform pg_temp.v061_ok(a, format('insert into conversations (participant_a_id, participant_b_id) values (%L, %L)', a, c));
end $$;

select 'ALL 061 CHECKS PASSED' as result;
rollback;
