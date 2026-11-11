-- ============================================================
-- Verification for migration 071 (run on STAGING after applying 070 and 071,
-- in the Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users,
-- pins and chats, so it leaves nothing behind. Expected final output: a
-- single row 'ALL 071 CHECKS PASSED'. Any failed check aborts with an error
-- naming it.
--
--   A …a1 and B …b2 trade in a chat   C …c3 blocks A   D …d4 gets suspended
--   E …e5 admin
-- Works whether or not 066 is applied (everyone accepts messages and trades).
-- ============================================================
begin;

create or replace function pg_temp.v071_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v071_refused(p_uid uuid, p_sql text, p_like text default null)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  perform pg_temp.v071_as(p_uid);
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

create or replace function pg_temp.v071_ok(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_temp.v071_as(p_uid);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

-- The caller's unread count in one chat, as the badge reads it (026).
create or replace function pg_temp.v071_unread(p_uid uuid, p_conv uuid) returns bigint language plpgsql as $$
declare v_n bigint;
begin
  perform pg_temp.v071_as(p_uid);
  set local role authenticated;
  select coalesce((select unread_count from get_conversation_unread_counts() where conversation_id = p_conv), 0) into v_n;
  reset role;
  return v_n;
end $$;

create or replace function pg_temp.v071_waiting(p_uid uuid) returns integer language plpgsql as $$
declare v_n integer;
begin
  perform pg_temp.v071_as(p_uid);
  set local role authenticated;
  select trades_waiting_for_me() into v_n;
  reset role;
  return v_n;
end $$;

-- Note: now() is fixed inside this transaction, so every message has the same
-- created_at and a chat can't be "read" part-way. Unread counts are checked
-- as running totals instead: each step must raise the other collector's.

-- 1. Shape, grants and policies
do $$
begin
  assert has_function_privilege('authenticated', 'public.trades_waiting_for_me()', 'execute'), '1a cannot count';
  assert not has_function_privilege('anon', 'public.trades_waiting_for_me()', 'execute'), '1b anon can count';
  assert not has_function_privilege('authenticated', 'public.trade_post_event(trades,text,uuid)', 'execute'), '1c helper exposed';
  assert not has_function_privilege('authenticated', 'public.trades_post_chat_event()', 'execute'), '1d trigger exposed';
  assert not has_function_privilege('authenticated', 'public.conversations_post_trade_proposed()', 'execute'), '1e trigger exposed';
  assert exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'conv_messages_insert_no_trade_event' and permissive = 'RESTRICTIVE'), '1f policy missing';
  assert exists (select 1 from pg_trigger where tgname = 'trades_post_chat_event'), '1g trades trigger missing';
  assert exists (select 1 from pg_trigger where tgname = 'conversations_post_trade_proposed'), '1h conversations trigger missing';
end $$;

-- 2. Test data (rolled back)
insert into auth.users (id) values
  ('07100000-0000-4000-8000-0000000000a1'), ('07100000-0000-4000-8000-0000000000b2'),
  ('07100000-0000-4000-8000-0000000000c3'), ('07100000-0000-4000-8000-0000000000d4'),
  ('07100000-0000-4000-8000-0000000000e5');
insert into profiles (id) values
  ('07100000-0000-4000-8000-0000000000a1'), ('07100000-0000-4000-8000-0000000000b2'),
  ('07100000-0000-4000-8000-0000000000c3'), ('07100000-0000-4000-8000-0000000000d4'),
  ('07100000-0000-4000-8000-0000000000e5')
  on conflict (id) do nothing;
update profiles set allow_trade_requests = true, allow_messages = true
 where id::text like '07100000-0000-4000-8000-%';
update profiles set username = 'v071alex' where id = '07100000-0000-4000-8000-0000000000a1';
update profiles set username = 'v071bea' where id = '07100000-0000-4000-8000-0000000000b2';
update profiles set is_admin = true where id = '07100000-0000-4000-8000-0000000000e5';
insert into pins (pinhunt_id, title, brand, collection, verification_status) values
  ('PHUK-VERIFY71A', 'Verify 071 pin A', 'Disney', '', 'verified'),
  ('PHUK-VERIFY71B', 'Verify 071 pin B', 'Disney', '', 'verified');
insert into conversations (id, participant_a_id, participant_b_id) values
  ('07100000-0000-4000-8000-00000000c0ab', '07100000-0000-4000-8000-0000000000a1', '07100000-0000-4000-8000-0000000000b2'),
  ('07100000-0000-4000-8000-00000000c0ac', '07100000-0000-4000-8000-0000000000a1', '07100000-0000-4000-8000-0000000000c3'),
  ('07100000-0000-4000-8000-00000000c0ad', '07100000-0000-4000-8000-0000000000a1', '07100000-0000-4000-8000-0000000000d4');

do $$
declare
  a uuid := '07100000-0000-4000-8000-0000000000a1';
  b uuid := '07100000-0000-4000-8000-0000000000b2';
  c uuid := '07100000-0000-4000-8000-0000000000c3';
  d uuid := '07100000-0000-4000-8000-0000000000d4';
  e uuid := '07100000-0000-4000-8000-0000000000e5';
  ab uuid := '07100000-0000-4000-8000-00000000c0ab';
  ac uuid := '07100000-0000-4000-8000-00000000c0ac';
  ad uuid := '07100000-0000-4000-8000-00000000c0ad';
  pins text := '[{"pinhunt_id":"PHUK-VERIFY71A","direction":"offered"},{"pinhunt_id":"PHUK-VERIFY71B","direction":"requested"}]';
  t uuid;
  t2 uuid;
  lines integer;
begin
  -- 3. Clients can't write trade lines
  assert pg_temp.v071_refused(a, format(
    'insert into conversation_messages (conversation_id, sender_id, body, trade_event) values (%L, %L, %L, %L)',
    ab, a, 'fake', 'accepted')), '3a client wrote a trade line';

  -- 4. Propose: B's unread goes up, one 'proposed' line, B has a trade waiting
  assert pg_temp.v071_waiting(a) = 0 and pg_temp.v071_waiting(b) = 0, '4a waiting before any trade';
  perform pg_temp.v071_ok(a, format('select trade_propose_in_chat(%L, null, %L)', ab, pins));
  select id into t from trades where initiator_id = a and recipient_id = b;
  assert (select count(*) from conversation_messages where trade_id = t and trade_event = 'proposed'
            and sender_id = a and body = '@v071alex proposed a trade.') = 1, '4b proposed line missing or wrong';
  assert pg_temp.v071_unread(b, ab) = 1, '4c B unread after propose';
  assert pg_temp.v071_unread(a, ab) = 0, '4d A unread after own propose';
  assert pg_temp.v071_waiting(b) = 1 and pg_temp.v071_waiting(a) = 0, '4e waiting after propose';

  -- 5. B changes the pins: A's unread goes up
  perform pg_temp.v071_ok(b, format('select trade_set_items(%L, %L)', t,
    '[{"pinhunt_id":"PHUK-VERIFY71A","direction":"offered"}]'));
  assert (select count(*) from conversation_messages where trade_id = t and trade_event = 'items_changed' and sender_id = b) = 1, '5a items_changed line';
  assert pg_temp.v071_unread(a, ab) = 1, '5b A unread after change';

  -- 6. Accept: A's unread goes up; both must now post
  perform pg_temp.v071_ok(b, format('select trade_accept(%L)', t));
  assert (select count(*) from conversation_messages where trade_id = t and trade_event = 'accepted' and sender_id = b) = 1, '6a accepted line';
  assert pg_temp.v071_unread(a, ab) = 2, '6b A unread after accept';
  assert pg_temp.v071_waiting(a) = 1 and pg_temp.v071_waiting(b) = 1, '6c both should post';

  -- 7. Posted: one line per side; adding tracking later writes nothing
  perform pg_temp.v071_ok(a, format('select trade_mark_posted(%L)', t));
  perform pg_temp.v071_ok(a, format('select trade_mark_posted(%L, %L, %L)', t, 'Royal Mail', 'RM1'));
  assert (select count(*) from conversation_messages where trade_id = t and trade_event = 'posted' and sender_id = a) = 1, '7a one posted line for A';
  assert pg_temp.v071_unread(b, ab) = 2, '7b B unread after A posted';
  assert pg_temp.v071_waiting(a) = 0, '7c A waiting after posting (B has not posted)';
  assert pg_temp.v071_waiting(b) = 1, '7d B should post';
  perform pg_temp.v071_ok(b, format('select trade_mark_posted(%L)', t));
  assert pg_temp.v071_unread(a, ab) = 3, '7e A unread after B posted';
  assert pg_temp.v071_waiting(a) = 1 and pg_temp.v071_waiting(b) = 1, '7f both should confirm receipt';

  -- 8. Received, then completed: one line each, never both for one mark
  perform pg_temp.v071_ok(a, format('select trade_mark_received(%L)', t));
  assert (select count(*) from conversation_messages where trade_id = t and trade_event = 'received' and sender_id = a) = 1, '8a received line';
  assert pg_temp.v071_unread(b, ab) = 3, '8b B unread after received';
  assert pg_temp.v071_waiting(a) = 0 and pg_temp.v071_waiting(b) = 1, '8c waiting after A received';
  perform pg_temp.v071_ok(b, format('select trade_mark_received(%L)', t));
  assert (select status from trades where id = t) = 'completed', '8d not completed';
  assert (select count(*) from conversation_messages where trade_id = t and trade_event = 'completed' and sender_id = b) = 1, '8e completed line';
  assert (select count(*) from conversation_messages where trade_id = t and trade_event = 'received' and sender_id = b) = 0, '8f extra received line';
  assert pg_temp.v071_unread(a, ab) = 4, '8g A unread after completion';
  assert pg_temp.v071_waiting(a) = 0 and pg_temp.v071_waiting(b) = 0, '8h waiting after completion';
  select count(*) into lines from conversation_messages where trade_id = t;
  assert lines = 7, format('8i expected 7 trade lines, got %s', lines);

  -- 9. Blocked: no line is written, the step still works
  perform pg_temp.v071_ok(a, format('select trade_propose_in_chat(%L, null, %L)', ac, pins));
  select id into t2 from trades where initiator_id = a and recipient_id = c;
  insert into user_blocks (blocker_id, blocked_id) values (c, a);
  perform pg_temp.v071_ok(c, format('select trade_decline(%L)', t2));
  assert (select status from trades where id = t2) = 'rejected', '9a decline failed';
  assert not exists (select 1 from conversation_messages where trade_id = t2 and trade_event = 'declined'), '9b line written despite block';

  -- 10. Suspended: no line is written, the step still works
  perform pg_temp.v071_ok(a, format('select trade_propose_in_chat(%L, null, %L)', ad, pins));
  select id into t2 from trades where initiator_id = a and recipient_id = d;
  insert into user_suspensions (user_id, suspended_by) values (d, e);
  perform pg_temp.v071_ok(a, format('select trade_cancel(%L)', t2));
  assert (select status from trades where id = t2) = 'cancelled', '10a cancel failed';
  assert not exists (select 1 from conversation_messages where trade_id = t2 and trade_event = 'cancelled'), '10b line written despite suspension';
  delete from user_suspensions where user_id = d;

  -- 11. An admin closing a problem report writes nothing as the admin
  update trades set status = 'problem', problem_reported_by = a, problem_reported_at = now()
   where id = t2;
  perform pg_temp.v071_as(e);
  perform admin_resolve_trade_problem(t2, 'cancelled', null);
  assert not exists (select 1 from conversation_messages where trade_id = t2 and sender_id = e), '11a admin line written';
end $$;

select 'ALL 071 CHECKS PASSED' as result;

rollback;
