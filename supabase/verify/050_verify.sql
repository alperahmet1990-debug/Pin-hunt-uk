-- ============================================================
-- Verification for migration 050 (run on STAGING after applying 050, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates six throwaway auth users
-- (fixed ids 05000000-0000-4000-8000-0000000000a1 … a6, no email), so it does
-- not depend on existing accounts and leaves nothing behind. Expected final
-- output: a single row 'ALL 050 CHECKS PASSED'. Any failed check aborts with
-- an error naming it.
--
-- RLS cases switch to the `authenticated` role with the user's id in the JWT
-- claim settings, the same way PostgREST does.
--
--   A  …a1  regular user (blocks B, reports B)
--   B  …b2  regular user (blocked by A)
--   C  …c3  regular user (bystander)
--   D  …d4  admin
--   E  …e5  regular user (suspended by D)
--   F  …f6  admin (target for the admin-on-admin check)
-- ============================================================
begin;

-- Act as a user: postgres-only helper, called while the role is postgres.
create or replace function pg_temp.v050_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- 1. Shape, RLS, restrictive policies, grants
do $$
declare t text; f text;
begin
  foreach t in array array['user_blocks', 'user_reports', 'user_suspensions'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), format('1a RLS off on %s', t);
    assert not has_table_privilege('anon', 'public.' || t, 'select'), format('1b anon can read %s', t);
    assert not has_table_privilege('anon', 'public.' || t, 'insert'), format('1c anon can insert %s', t);
    assert not has_table_privilege('authenticated', 'public.' || t, 'update'), format('1d authenticated can update %s', t);
  end loop;

  assert (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
           and policyname in ('community_posts_insert_not_suspended', 'community_posts_update_not_suspended',
                              'post_comments_insert_not_suspended', 'conversations_insert_not_blocked',
                              'conv_messages_insert_not_blocked', 'trade_messages_insert_not_blocked',
                              'trades_insert_not_blocked')) = 7, '1e a restrictive policy is missing';

  -- Existing permissive write policies are still in place.
  assert exists (select 1 from pg_policies where tablename = 'community_posts' and policyname = 'community_posts_insert_own'), '1f community_posts_insert_own missing';
  assert exists (select 1 from pg_policies where tablename = 'conversations' and policyname = 'conversations_insert_participant'), '1g conversations_insert_participant missing';
  assert exists (select 1 from pg_policies where tablename = 'conversation_messages' and policyname = 'conv_messages_insert_participant'), '1h conv_messages_insert_participant missing';

  -- The RLS cases below treat "permission denied" as a pass, so first make
  -- sure the authenticated role can reach auth.uid() at all.
  assert has_function_privilege('authenticated', 'auth.uid()', 'execute')
         and has_schema_privilege('authenticated', 'auth', 'usage'), '1k authenticated cannot call auth.uid()';

  foreach f in array array['is_current_user_suspended()', 'is_blocked_with(uuid)',
                           'conversation_has_block(uuid)', 'trade_has_block(uuid)'] loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute'), format('1i anon can execute %s', f);
    assert has_function_privilege('authenticated', 'public.' || f, 'execute'), format('1j authenticated cannot execute %s', f);
  end loop;
end $$;

-- 2. Test data (as postgres; rolled back)
insert into auth.users (id) values
  ('05000000-0000-4000-8000-0000000000a1'), ('05000000-0000-4000-8000-0000000000b2'),
  ('05000000-0000-4000-8000-0000000000c3'), ('05000000-0000-4000-8000-0000000000d4'),
  ('05000000-0000-4000-8000-0000000000e5'), ('05000000-0000-4000-8000-0000000000f6');
insert into profiles (id) values
  ('05000000-0000-4000-8000-0000000000a1'), ('05000000-0000-4000-8000-0000000000b2'),
  ('05000000-0000-4000-8000-0000000000c3'), ('05000000-0000-4000-8000-0000000000d4'),
  ('05000000-0000-4000-8000-0000000000e5'), ('05000000-0000-4000-8000-0000000000f6')
on conflict (id) do nothing;
update profiles set is_admin = true
 where id in ('05000000-0000-4000-8000-0000000000d4', '05000000-0000-4000-8000-0000000000f6');

insert into conversations (id, participant_a_id, participant_b_id) values
  ('05000000-0000-4000-8000-00000000c0ab', '05000000-0000-4000-8000-0000000000a1', '05000000-0000-4000-8000-0000000000b2'),
  ('05000000-0000-4000-8000-00000000c0bc', '05000000-0000-4000-8000-0000000000b2', '05000000-0000-4000-8000-0000000000c3'),
  ('05000000-0000-4000-8000-00000000c0ec', '05000000-0000-4000-8000-0000000000e5', '05000000-0000-4000-8000-0000000000c3');
insert into conversation_messages (id, conversation_id, sender_id, body) values
  ('05000000-0000-4000-8000-00000000ae51', '05000000-0000-4000-8000-00000000c0ab', '05000000-0000-4000-8000-0000000000b2', 'verify 050 message from B');
insert into trades (id, initiator_id, recipient_id) values
  ('05000000-0000-4000-8000-0000000071ab', '05000000-0000-4000-8000-0000000000a1', '05000000-0000-4000-8000-0000000000b2'),
  ('05000000-0000-4000-8000-0000000071ec', '05000000-0000-4000-8000-0000000000e5', '05000000-0000-4000-8000-0000000000c3');
insert into community_posts (id, author_id, post_type, body) values
  ('05000000-0000-4000-8000-00000000b057', '05000000-0000-4000-8000-0000000000e5', 'discussion', 'verify 050 post by E');
-- Someone else's block, which A must not see or remove.
insert into user_blocks (blocker_id, blocked_id) values
  ('05000000-0000-4000-8000-0000000000c3', '05000000-0000-4000-8000-0000000000a1');

-- 3. Users manage only their own blocks (as A)
select pg_temp.v050_as('05000000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
declare ok boolean; n int;
begin
  insert into user_blocks (blocker_id, blocked_id)
  values (auth.uid(), '05000000-0000-4000-8000-0000000000b2');

  ok := false;
  begin
    insert into user_blocks (blocker_id, blocked_id)
    values ('05000000-0000-4000-8000-0000000000c3', '05000000-0000-4000-8000-0000000000b2');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '3a a user created a block for someone else';

  assert (select count(*) from user_blocks) = 1, '3b a user can read blocks other than their own';
  assert not exists (select 1 from user_blocks where blocker_id <> auth.uid()), '3c foreign block visible';

  delete from user_blocks where blocker_id = '05000000-0000-4000-8000-0000000000c3';
  get diagnostics n = row_count;
  assert n = 0, '3d a user deleted someone else''s block';

  ok := false;
  begin
    update user_blocks set created_at = now() where blocker_id = auth.uid();
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '3e blocks are editable';

  ok := false;
  begin
    insert into user_blocks (blocker_id, blocked_id) values (auth.uid(), auth.uid());
  exception when check_violation then ok := true;
  end;
  assert ok, '3f self-block accepted';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from user_blocks where blocker_id = '05000000-0000-4000-8000-0000000000c3'), '3g foreign block was removed';
end $$;

-- 4. Blocked users cannot start conversations or message the blocker (as B)
select pg_temp.v050_as('05000000-0000-4000-8000-0000000000b2');
set local role authenticated;
do $$
declare ok boolean;
begin
  assert is_blocked_with('05000000-0000-4000-8000-0000000000a1'), '4a is_blocked_with false for the blocked side';

  ok := false;
  begin
    insert into conversations (participant_a_id, participant_b_id)
    values (auth.uid(), '05000000-0000-4000-8000-0000000000a1');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '4b blocked user started a conversation with the blocker';

  ok := false;
  begin
    insert into conversations (participant_a_id, participant_b_id)
    values ('05000000-0000-4000-8000-0000000000a1', auth.uid());
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '4c blocked user started a conversation with the blocker (reversed columns)';

  ok := false;
  begin
    insert into conversation_messages (conversation_id, sender_id, body)
    values ('05000000-0000-4000-8000-00000000c0ab', auth.uid(), 'should fail');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '4d blocked user sent a message in an existing conversation';

  ok := false;
  begin
    insert into trade_messages (trade_id, sender_id, message)
    values ('05000000-0000-4000-8000-0000000071ab', auth.uid(), 'should fail');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '4e blocked user sent a trade message';

  ok := false;
  begin
    insert into trades (initiator_id, recipient_id)
    values (auth.uid(), '05000000-0000-4000-8000-0000000000a1');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '4f blocked user proposed a trade to the blocker';

  -- Unaffected: messaging someone else, and reading the existing thread.
  insert into conversation_messages (conversation_id, sender_id, body)
  values ('05000000-0000-4000-8000-00000000c0bc', auth.uid(), 'B to C still works');
  assert (select count(*) from conversation_messages
           where conversation_id = '05000000-0000-4000-8000-00000000c0ab') = 1, '4g existing thread no longer readable';
  assert (select count(*) from user_blocks) = 0, '4h blocked user can see who blocked them';
end $$;
reset role;

-- The block also stops the blocker messaging the blocked user (as A).
select pg_temp.v050_as('05000000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
declare ok boolean := false;
begin
  begin
    insert into conversation_messages (conversation_id, sender_id, body)
    values ('05000000-0000-4000-8000-00000000c0ab', auth.uid(), 'should fail');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '4i blocker sent a message to the blocked user';

  -- A has been blocked by C (setup), so A cannot open a conversation with C either.
  ok := false;
  begin
    insert into conversations (participant_a_id, participant_b_id)
    values (auth.uid(), '05000000-0000-4000-8000-0000000000c3');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '4j user blocked by C started a conversation with C';

  -- Unblock restores messaging.
  delete from user_blocks where blocked_id = '05000000-0000-4000-8000-0000000000b2';
  insert into conversation_messages (conversation_id, sender_id, body)
  values ('05000000-0000-4000-8000-00000000c0ab', auth.uid(), 'after unblock');
  -- Put the block back for the report checks.
  insert into user_blocks (blocker_id, blocked_id) values (auth.uid(), '05000000-0000-4000-8000-0000000000b2');
end $$;
reset role;

-- 5. Reports: reporter and admins only
select pg_temp.v050_as('05000000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
declare ok boolean; n int;
begin
  insert into user_reports (reporter_id, reported_user_id, reason)
  values (auth.uid(), '05000000-0000-4000-8000-0000000000b2', 'verify 050 profile report');

  ok := false;
  begin
    insert into user_reports (reporter_id, reported_user_id, message_id)
    values (auth.uid(), '05000000-0000-4000-8000-0000000000c3', '05000000-0000-4000-8000-00000000ae51');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '5c message report names someone other than the sender';

  insert into user_reports (reporter_id, reported_user_id, message_id)
  values (auth.uid(), '05000000-0000-4000-8000-0000000000b2', '05000000-0000-4000-8000-00000000ae51');

  ok := false;
  begin
    insert into user_reports (reporter_id, reported_user_id)
    values (auth.uid(), '05000000-0000-4000-8000-0000000000b2');
  exception when unique_violation then ok := true;
  end;
  assert ok, '5a duplicate profile report accepted';

  ok := false;
  begin
    insert into user_reports (reporter_id, reported_user_id)
    values ('05000000-0000-4000-8000-0000000000c3', '05000000-0000-4000-8000-0000000000b2');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '5b report filed in someone else''s name';

  assert (select count(*) from user_reports) = 2, '5d reporter cannot see exactly their own reports';

  delete from user_reports;
  get diagnostics n = row_count;
  assert n = 0, '5e non-admin deleted a report';
end $$;
reset role;

select pg_temp.v050_as('05000000-0000-4000-8000-0000000000c3');
set local role authenticated;
do $$
declare ok boolean := false;
begin
  begin
    insert into user_reports (reporter_id, reported_user_id, message_id)
    values (auth.uid(), '05000000-0000-4000-8000-0000000000b2', '05000000-0000-4000-8000-00000000ae51');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '5f non-participant reported a message';
  assert (select count(*) from user_reports) = 0, '5g bystander can see other users'' reports';
end $$;
reset role;

select pg_temp.v050_as('05000000-0000-4000-8000-0000000000b2');
set local role authenticated;
do $$ begin
  assert (select count(*) from user_reports) = 0, '5h reported user can see reports about them';
end $$;
reset role;

select pg_temp.v050_as('05000000-0000-4000-8000-0000000000d4');
set local role authenticated;
do $$
declare n int;
begin
  assert (select count(*) from user_reports
           where reporter_id = '05000000-0000-4000-8000-0000000000a1') = 2, '5i admin cannot see reports';
  delete from user_reports where message_id is not null and reporter_id = '05000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 1, '5j admin cannot dismiss a report';
end $$;
reset role;

-- 6. Suspension
select pg_temp.v050_as('05000000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
declare ok boolean := false;
begin
  begin
    insert into user_suspensions (user_id, suspended_by)
    values ('05000000-0000-4000-8000-0000000000e5', auth.uid());
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6a non-admin suspended an account';
end $$;
reset role;

select pg_temp.v050_as('05000000-0000-4000-8000-0000000000d4');
set local role authenticated;
do $$
declare ok boolean;
begin
  insert into user_suspensions (user_id, suspended_by, reason)
  values ('05000000-0000-4000-8000-0000000000e5', auth.uid(), 'verify 050');

  ok := false;
  begin
    insert into user_suspensions (user_id, suspended_by) values (auth.uid(), auth.uid());
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6b admin suspended themselves';

  ok := false;
  begin
    insert into user_suspensions (user_id, suspended_by)
    values ('05000000-0000-4000-8000-0000000000f6', auth.uid());
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6c admin suspended another admin without App Creator';
end $$;
reset role;

select pg_temp.v050_as('05000000-0000-4000-8000-0000000000e5');
set local role authenticated;
do $$
declare ok boolean; n int;
begin
  assert is_current_user_suspended(), '6d suspension not visible to the helper';
  assert (select count(*) from user_suspensions) = 0, '6e suspended user can read suspension rows';

  ok := false;
  begin
    insert into community_posts (author_id, post_type, body) values (auth.uid(), 'discussion', 'should fail');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6f suspended user posted';

  update community_posts set body = 'edited while suspended'
   where id = '05000000-0000-4000-8000-00000000b057';
  get diagnostics n = row_count;
  assert n = 0, '6g suspended user edited a post';

  ok := false;
  begin
    insert into post_comments (post_id, author_id, body)
    values ('05000000-0000-4000-8000-00000000b057', auth.uid(), 'should fail');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6h suspended user commented';

  ok := false;
  begin
    insert into conversations (participant_a_id, participant_b_id)
    values (auth.uid(), '05000000-0000-4000-8000-0000000000a1');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6i suspended user started a conversation';

  ok := false;
  begin
    insert into conversation_messages (conversation_id, sender_id, body)
    values ('05000000-0000-4000-8000-00000000c0ec', auth.uid(), 'should fail');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6j suspended user sent a message';

  ok := false;
  begin
    insert into trade_messages (trade_id, sender_id, message)
    values ('05000000-0000-4000-8000-0000000071ec', auth.uid(), 'should fail');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6k suspended user sent a trade message';

  ok := false;
  begin
    insert into trades (initiator_id, recipient_id) values (auth.uid(), '05000000-0000-4000-8000-0000000000c3');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '6l suspended user proposed a trade';

  assert (select count(*) from community_posts where id = '05000000-0000-4000-8000-00000000b057') = 1,
         '6m suspended user can no longer read posts';
end $$;
reset role;

-- Regression: a user who is not suspended or blocked can still post and message.
select pg_temp.v050_as('05000000-0000-4000-8000-0000000000c3');
set local role authenticated;
do $$ begin
  assert not is_current_user_suspended(), '6n helper reports a suspension that does not exist';
  insert into community_posts (author_id, post_type, body) values (auth.uid(), 'discussion', 'verify 050 post by C');
  insert into post_comments (post_id, author_id, body)
  values ('05000000-0000-4000-8000-00000000b057', auth.uid(), 'verify 050 comment by C');
  insert into conversation_messages (conversation_id, sender_id, body)
  values ('05000000-0000-4000-8000-00000000c0ec', auth.uid(), 'C to E still works');
  insert into trade_messages (trade_id, sender_id, message)
  values ('05000000-0000-4000-8000-0000000071ec', auth.uid(), 'C trade message still works');
end $$;
reset role;

-- Lifting the suspension restores posting.
select pg_temp.v050_as('05000000-0000-4000-8000-0000000000d4');
set local role authenticated;
delete from user_suspensions where user_id = '05000000-0000-4000-8000-0000000000e5';
reset role;
select pg_temp.v050_as('05000000-0000-4000-8000-0000000000e5');
set local role authenticated;
do $$ begin
  insert into community_posts (author_id, post_type, body) values (auth.uid(), 'discussion', 'verify 050 after unsuspend');
end $$;
reset role;

-- 7. Account deletion is not blocked by any 050 row (#13)
do $$ begin
  insert into user_suspensions (user_id, suspended_by)
  values ('05000000-0000-4000-8000-0000000000e5', '05000000-0000-4000-8000-0000000000d4');
  delete from auth.users where id in ('05000000-0000-4000-8000-0000000000a1',
                                      '05000000-0000-4000-8000-0000000000b2',
                                      '05000000-0000-4000-8000-0000000000d4');
  assert not exists (select 1 from user_blocks where '05000000-0000-4000-8000-0000000000a1' in (blocker_id, blocked_id)), '7a blocks survived deletion';
  assert not exists (select 1 from user_reports where '05000000-0000-4000-8000-0000000000a1' in (reporter_id, reported_user_id)), '7b reports survived deletion';
  assert (select suspended_by is null from user_suspensions where user_id = '05000000-0000-4000-8000-0000000000e5'),
         '7c suspension lost or still names the deleted admin';
end $$;

select 'ALL 050 CHECKS PASSED' as result;
rollback;
