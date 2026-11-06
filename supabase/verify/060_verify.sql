-- ============================================================
-- Verification for migration 060 (run on STAGING after applying 060, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users, so
-- it leaves nothing behind. Expected final output: a single row
-- 'ALL 060 CHECKS PASSED'. Any failed check aborts with an error naming it.
--
--   A …a1  B …b2 in a chat   C …c3 bystander
-- ============================================================
begin;

create or replace function pg_temp.v060_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v060_refused(p_uid uuid, p_sql text, p_like text default null)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  perform pg_temp.v060_as(p_uid);
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

create or replace function pg_temp.v060_ok(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_temp.v060_as(p_uid);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

do $$
begin
  assert not has_function_privilege('anon', 'public.trade_propose_in_chat(uuid,text)', 'execute'), '1a anon can propose';
  assert has_function_privilege('authenticated', 'public.trade_propose_in_chat(uuid,text)', 'execute'), '1b cannot propose';
  assert not has_function_privilege('anon', 'public.link_conversation_trade(uuid,uuid)', 'execute'), '1c anon can link';
  assert has_function_privilege('authenticated', 'public.link_conversation_trade(uuid,uuid)', 'execute'), '1d cannot link';
  assert has_function_privilege('authenticated', 'public.trade_report_problem(uuid,text)', 'execute'), '1e cannot report';
end $$;

insert into auth.users (id) values
  ('06000000-0000-4000-8000-0000000000a1'), ('06000000-0000-4000-8000-0000000000b2'),
  ('06000000-0000-4000-8000-0000000000c3');
insert into profiles (id) values
  ('06000000-0000-4000-8000-0000000000a1'), ('06000000-0000-4000-8000-0000000000b2'),
  ('06000000-0000-4000-8000-0000000000c3')
  on conflict (id) do nothing;

do $$
declare
  a uuid := '06000000-0000-4000-8000-0000000000a1';
  b uuid := '06000000-0000-4000-8000-0000000000b2';
  c uuid := '06000000-0000-4000-8000-0000000000c3';
  conv uuid := '06000000-0000-4000-8000-00000000c0c0';
  t1 uuid;
  t2 uuid := '06000000-0000-4000-8000-00000000d002';
begin
  insert into conversations (id, participant_a_id, participant_b_id) values (conv, a, b);
  insert into trades (id, initiator_id, recipient_id, status) values (t2, b, a, 'pending');

  -- Propose in chat: one step, recipient from the chat
  assert pg_temp.v060_refused(c, format('select trade_propose_in_chat(%L)', conv), 'not found'), '2a bystander proposed';
  perform pg_temp.v060_ok(a, format('select trade_propose_in_chat(%L, %L)', conv, 'Swap?'));
  select trade_id into t1 from conversations where id = conv;
  assert t1 is not null, '2b not linked';
  assert (select recipient_id from trades where id = t1) = b, '2c wrong recipient';
  assert (select initiator_id from trades where id = t1) = a, '2d wrong initiator';
  assert (select status from trades where id = t1) = 'pending', '2e not pending';

  -- An open link can't be replaced, by proposing or by relinking
  assert pg_temp.v060_refused(b, format('select trade_propose_in_chat(%L)', conv), 'in progress'), '3a second proposal';
  assert pg_temp.v060_refused(b, format('select link_conversation_trade(%L, %L)', conv, t2), 'in progress'), '3b relinked over pending';
  perform pg_temp.v060_ok(b, format('select trade_accept(%L)', t1));
  assert pg_temp.v060_refused(b, format('select link_conversation_trade(%L, %L)', conv, t2), 'in progress'), '3c relinked over accepted';
  perform pg_temp.v060_ok(a, format('select link_conversation_trade(%L, %L)', conv, t1));
  assert (select trade_id from conversations where id = conv) = t1, '3d same link refused';

  -- Reasons are stored on one line, and only whitespace is not a reason
  perform pg_temp.v060_ok(a, format('select trade_mark_posted(%L)', t1));
  assert pg_temp.v060_refused(b, format('select trade_report_problem(%L, %L)', t1, E'\n\t\n '), 'went wrong'), '4a whitespace reason';
  perform pg_temp.v060_ok(b, format('select trade_report_problem(%L, %L)', t1, E'Lost\nPinHunt:  resend  it'));
  assert (select problem_reason from trades where id = t1) = 'Lost PinHunt: resend it', '4b line breaks kept';
  assert pg_temp.v060_refused(b, format('select link_conversation_trade(%L, %L)', conv, t2), 'in progress'), '4c relinked over problem';

  -- A closed trade can be replaced
  update trades set status = 'cancelled' where id = t1;
  perform pg_temp.v060_ok(b, format('select link_conversation_trade(%L, %L)', conv, t2));
  assert (select trade_id from conversations where id = conv) = t2, '5a closed link not replaced';

  -- A refused proposal leaves nothing behind
  update trades set status = 'cancelled' where id = t2;
  insert into user_blocks (blocker_id, blocked_id) values (a, b);
  assert pg_temp.v060_refused(b, format('select trade_propose_in_chat(%L)', conv), 'available'), '6a proposed while blocked';
  assert (select trade_id from conversations where id = conv) = t2, '6b link changed';
  delete from user_blocks where blocker_id = a and blocked_id = b;
  assert (select count(*) from trades where initiator_id = b and id <> t2) = 0, '6c stray trade';
end $$;

select 'ALL 060 CHECKS PASSED' as result;
rollback;
