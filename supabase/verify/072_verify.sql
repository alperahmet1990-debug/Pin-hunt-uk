-- ============================================================
-- Verification for migration 072 (run on STAGING after applying 072, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates four throwaway auth
-- users (fixed ids 07200000-0000-4000-8000-0000000000a1 … d4, no email), so
-- it does not depend on existing accounts and leaves nothing behind.
-- Expected final output: a single row 'ALL 072 CHECKS PASSED'. Any failed
-- check aborts with an error naming it.
--
-- RLS cases switch to the `authenticated` role with the user's id in the JWT
-- claim settings, the same way PostgREST does.
--
--   A  …a1  regular user, reports B's messages
--   B  …b2  regular user, sender of the reported messages
--   C  …c3  regular user, bystander
--   D  …d4  admin
-- ============================================================
begin;

-- Guard: staging only (same marker as the migration).
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'trade_for_participant') then
    raise exception '072 verify guard: this does not look like staging. Nothing was run.';
  end if;
end $$;

create or replace function pg_temp.v072_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- 1. Shape, RLS and grants
do $$
begin
  assert exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'conversation_messages'
                    and column_name = 'removed_at' and is_nullable = 'YES'), '1a removed_at missing';
  assert (select relrowsecurity from pg_class where oid = 'public.message_moderation_events'::regclass), '1b RLS off on events';
  assert not has_table_privilege('anon', 'public.message_moderation_events', 'select'), '1c anon can read events';
  assert has_table_privilege('authenticated', 'public.message_moderation_events', 'select'), '1d authenticated cannot select events (admins need it)';
  assert not has_table_privilege('authenticated', 'public.message_moderation_events', 'insert'), '1e authenticated can insert events';
  assert not has_table_privilege('authenticated', 'public.message_moderation_events', 'update'), '1f authenticated can update events';
  assert not has_table_privilege('authenticated', 'public.message_moderation_events', 'delete'), '1g authenticated can delete events';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'message_moderation_events') = 1,
         '1h events should have exactly one (admin select) policy';

  assert not has_function_privilege('anon', 'public.get_reported_message(uuid)', 'execute'), '1i anon can view reported messages';
  assert has_function_privilege('authenticated', 'public.get_reported_message(uuid)', 'execute'), '1j authenticated cannot call get_reported_message';
  assert not has_function_privilege('anon', 'public.remove_reported_message(uuid, uuid, text)', 'execute'), '1k anon can remove';
  assert not has_function_privilege('authenticated', 'public.remove_reported_message(uuid, uuid, text)', 'execute'), '1l authenticated can remove directly';
  assert has_function_privilege('service_role', 'public.remove_reported_message(uuid, uuid, text)', 'execute'), '1m service role cannot remove';

  -- 032 and 033 validation triggers are still in place.
  assert exists (select 1 from pg_trigger where tgname = 'validate_conversation_message_payload_trigger' and not tgisinternal), '1n 032 trigger missing';
  assert exists (select 1 from pg_trigger where tgname = 'validate_conversation_photo_origins_trigger' and not tgisinternal), '1o 033 trigger missing';
  assert exists (select 1 from pg_trigger where tgname = 'validate_conversation_message_payload_update_trigger' and not tgisinternal), '1r 032 update trigger missing';
  assert exists (select 1 from pg_trigger where tgname = 'validate_conversation_photo_origins_update_trigger' and not tgisinternal), '1s 033 update trigger missing';
  -- Message access policies are unchanged: no update or delete policy for users.
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_messages'
                      and cmd in ('UPDATE', 'DELETE', 'ALL')), '1p a message update/delete policy exists';
  assert has_function_privilege('authenticated', 'auth.uid()', 'execute'), '1q authenticated cannot call auth.uid()';
end $$;

-- 2. Test data (as postgres; rolled back)
insert into auth.users (id) values
  ('07200000-0000-4000-8000-0000000000a1'), ('07200000-0000-4000-8000-0000000000b2'),
  ('07200000-0000-4000-8000-0000000000c3'), ('07200000-0000-4000-8000-0000000000d4');
insert into profiles (id) values
  ('07200000-0000-4000-8000-0000000000a1'), ('07200000-0000-4000-8000-0000000000b2'),
  ('07200000-0000-4000-8000-0000000000c3'), ('07200000-0000-4000-8000-0000000000d4')
on conflict (id) do nothing;
update profiles set is_admin = true where id = '07200000-0000-4000-8000-0000000000d4';

insert into conversations (id, participant_a_id, participant_b_id) values
  ('07200000-0000-4000-8000-00000000c0ab', '07200000-0000-4000-8000-0000000000a1', '07200000-0000-4000-8000-0000000000b2');
insert into conversation_messages (id, conversation_id, sender_id, body, created_at) values
  ('07200000-0000-4000-8000-0000000000e1', '07200000-0000-4000-8000-00000000c0ab', '07200000-0000-4000-8000-0000000000b2', 'verify 072 reported text', now() - interval '3 minutes'),
  ('07200000-0000-4000-8000-0000000000e4', '07200000-0000-4000-8000-00000000c0ab', '07200000-0000-4000-8000-0000000000b2', 'verify 072 unreported', now() - interval '1 minute');

-- Photo message: optional (some hosted projects do not let postgres insert
-- into storage.objects directly). Skipped with a notice if refused.
do $$ begin
  -- The photo-origin check (033, as later redefined) compares the URL with
  -- the JWT issuer's project URL.
  perform set_config('request.jwt.claims', '{"iss":"https://verify072.supabase.co/auth/v1"}', true);
  insert into storage.buckets (id, name, public) values ('community-photos', 'community-photos', true) on conflict (id) do nothing;
  insert into storage.objects (bucket_id, name) values
    ('community-photos', '07200000-0000-4000-8000-0000000000b2/v072.jpg');
  insert into conversation_messages (id, conversation_id, sender_id, body, message_type, photo_urls, created_at) values
    ('07200000-0000-4000-8000-0000000000e2', '07200000-0000-4000-8000-00000000c0ab', '07200000-0000-4000-8000-0000000000b2',
     'Shared a photo', 'photo',
     '["https://verify072.supabase.co/storage/v1/object/public/community-photos/07200000-0000-4000-8000-0000000000b2/v072.jpg"]',
     now() - interval '2 minutes');
exception when others then
  raise notice '2s photo message not inserted (%): photo checks skipped', sqlerrm;
end $$;

insert into user_reports (id, reporter_id, reported_user_id, message_id, reason) values
  ('07200000-0000-4000-8000-0000000000f1', '07200000-0000-4000-8000-0000000000a1', '07200000-0000-4000-8000-0000000000b2', '07200000-0000-4000-8000-0000000000e1', 'rude'),
  ('07200000-0000-4000-8000-0000000000f9', '07200000-0000-4000-8000-0000000000a1', '07200000-0000-4000-8000-0000000000b2', null, 'profile');
-- A report that names someone other than the message's sender (050's policy
-- stops users doing this; inserted directly here) must not count.
insert into user_reports (id, reporter_id, reported_user_id, message_id, reason) values
  ('07200000-0000-4000-8000-0000000000f3', '07200000-0000-4000-8000-0000000000a1', '07200000-0000-4000-8000-0000000000c3', '07200000-0000-4000-8000-0000000000e4', 'mismatch');
insert into user_reports (id, reporter_id, reported_user_id, message_id)
select '07200000-0000-4000-8000-0000000000f2', '07200000-0000-4000-8000-0000000000a1', '07200000-0000-4000-8000-0000000000b2', id
  from conversation_messages where id = '07200000-0000-4000-8000-0000000000e2';

-- 3. Non-admins can't view or remove, and can't read the record (as A, the reporter)
select pg_temp.v072_as('07200000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
declare ok boolean;
begin
  ok := false;
  begin
    perform get_reported_message('07200000-0000-4000-8000-0000000000f1');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '3a a non-admin viewed a reported message';

  ok := false;
  begin
    perform remove_reported_message('07200000-0000-4000-8000-0000000000a1', '07200000-0000-4000-8000-0000000000e1', 'x');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '3b a signed-in user called remove_reported_message';

  ok := false;
  begin
    insert into message_moderation_events (message_id, admin_id, action)
    values ('07200000-0000-4000-8000-0000000000e1', auth.uid(), 'viewed');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '3c a user wrote a moderation event';

  assert (select count(*) from message_moderation_events) = 0, '3d a non-admin can read moderation events';
  -- The reporter still reads the conversation as before.
  assert (select count(*) from conversation_messages
           where conversation_id = '07200000-0000-4000-8000-00000000c0ab') >= 2, '3e participant lost access to messages';
end $$;
reset role;

-- Bystander C sees nothing, as before.
select pg_temp.v072_as('07200000-0000-4000-8000-0000000000c3');
set local role authenticated;
do $$
declare ok boolean := false;
begin
  assert (select count(*) from conversation_messages
           where conversation_id = '07200000-0000-4000-8000-00000000c0ab') = 0, '3f bystander can read the conversation';
  begin
    perform get_reported_message('07200000-0000-4000-8000-0000000000f1');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, '3g bystander viewed a reported message';
end $$;
reset role;

-- 4. Admin views the reported message, and only that message (as D)
select pg_temp.v072_as('07200000-0000-4000-8000-0000000000d4');
set local role authenticated;
do $$
declare r jsonb; ok boolean;
begin
  -- Admins still can't read conversations directly.
  assert (select count(*) from conversation_messages
           where conversation_id = '07200000-0000-4000-8000-00000000c0ab') = 0, '4a admin can read conversations directly';

  r := get_reported_message('07200000-0000-4000-8000-0000000000f1');
  assert r->>'status' = 'ok', format('4b expected ok, got %s', r);
  assert r->'message'->>'id' = '07200000-0000-4000-8000-0000000000e1', '4c wrong message returned';
  assert r->'message'->>'body' = 'verify 072 reported text', '4d message text missing';
  assert not (r->'message' ? 'conversation_id'), '4e the conversation id is returned';
  assert jsonb_typeof(r->'message') = 'object', '4f more than one message returned';

  assert (select count(*) from message_moderation_events
           where message_id = '07200000-0000-4000-8000-0000000000e1' and action = 'viewed'
             and admin_id = auth.uid() and report_id = '07200000-0000-4000-8000-0000000000f1') = 1, '4g view not recorded';

  r := get_reported_message('07200000-0000-4000-8000-0000000000ff');
  assert r->>'status' = 'gone', '4h unknown report should be gone';

  r := get_reported_message('07200000-0000-4000-8000-0000000000f3');
  assert r->>'status' = 'gone', format('4k a report naming someone else showed the message: %s', r);

  ok := false;
  begin
    perform get_reported_message('07200000-0000-4000-8000-0000000000f9');
  exception when invalid_parameter_value then ok := true;
  end;
  assert ok, '4i profile report treated as a message report';

  -- Admin can't write the record directly either.
  ok := false;
  begin
    delete from message_moderation_events;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok or (select count(*) from message_moderation_events) >= 1, '4j admin deleted moderation events';
end $$;
reset role;

-- 5. Removal refusals (as postgres; the API calls it with the service role)
do $$
declare r jsonb;
begin
  r := remove_reported_message('07200000-0000-4000-8000-0000000000a1', '07200000-0000-4000-8000-0000000000e1', 'spam');
  assert r->>'status' = 'not_admin', format('5a non-admin removed: %s', r);
  r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e4', 'spam');
  -- e4's only report names someone other than its sender, so it has no open report.
  assert r->>'status' = 'no_open_report', format('5b removed a message with no valid report: %s', r);
  r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e1', '   ');
  assert r->>'status' = 'invalid_reason', '5c empty reason accepted';
  r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e1', repeat('x', 501));
  assert r->>'status' = 'invalid_reason', '5d 501-character reason accepted';
  r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000ee', 'spam');
  assert r->>'status' = 'not_found', '5e unknown message';
  assert (select removed_at is null and body = 'verify 072 reported text'
            from conversation_messages where id = '07200000-0000-4000-8000-0000000000e1'), '5f a refused removal changed the message';
end $$;

-- 6. Removal (as postgres)
do $$
declare r jsonb; n_before int; n_after int;
begin
  select count(*) into n_before from conversation_messages where conversation_id = '07200000-0000-4000-8000-00000000c0ab';

  r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e1', '  Harassment  ');
  assert r->>'status' = 'removed', format('6a text removal failed: %s', r);
  assert r->'photo_paths' = '[]'::jsonb, '6b text message returned photo paths';

  assert (select body = 'Removed by PinHunt moderators' and message_type = 'text' and removed_at is not null
                 and pin_ids = '[]'::jsonb and for_trade_pin_ids = '[]'::jsonb and photo_urls = '[]'::jsonb
            from conversation_messages where id = '07200000-0000-4000-8000-0000000000e1'), '6c message not replaced';
  assert exists (select 1 from user_reports where id = '07200000-0000-4000-8000-0000000000f1'), '6d report removed with the message';
  assert (select reason = 'Harassment' and admin_id = '07200000-0000-4000-8000-0000000000d4'
                 and report_id = '07200000-0000-4000-8000-0000000000f1'
            from message_moderation_events
           where message_id = '07200000-0000-4000-8000-0000000000e1' and action = 'removed'), '6e removal not recorded with its reason';

  r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e1', 'again');
  assert r->>'status' = 'already_removed', '6f second removal not reported as already removed';
  assert (select count(*) from message_moderation_events
           where message_id = '07200000-0000-4000-8000-0000000000e1' and action = 'removed') = 1, '6g second removal recorded twice';

  if exists (select 1 from conversation_messages where id = '07200000-0000-4000-8000-0000000000e2') then
    r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e2', 'Explicit photo');
    assert r->>'status' = 'removed', format('6h photo removal failed: %s', r);
    assert r->'photo_paths' = '["07200000-0000-4000-8000-0000000000b2/v072.jpg"]'::jsonb, format('6i wrong photo paths: %s', r);
    assert (select photo_urls = '[]'::jsonb and message_type = 'text'
              from conversation_messages where id = '07200000-0000-4000-8000-0000000000e2'), '6j photos not cleared';
    r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e2', 'again');
    assert r->'photo_paths' = '["07200000-0000-4000-8000-0000000000b2/v072.jpg"]'::jsonb, '6k retry does not repeat the photo paths';
  else
    raise notice '6h-6k photo removal skipped (no photo message)';
  end if;

  -- The rest of the conversation is unchanged.
  select count(*) into n_after from conversation_messages where conversation_id = '07200000-0000-4000-8000-00000000c0ab';
  assert n_after = n_before, '6l message count changed';
  assert (select body = 'verify 072 unreported' and removed_at is null
            from conversation_messages where id = '07200000-0000-4000-8000-0000000000e4'), '6m unreported message changed';
  assert exists (select 1 from conversations where id = '07200000-0000-4000-8000-00000000c0ab'), '6n conversation removed';
end $$;

-- 7. A removed message stays removed (as postgres)
do $$
declare ok boolean := false;
begin
  begin
    update conversation_messages set body = 'back again' where id = '07200000-0000-4000-8000-0000000000e1';
  exception when invalid_parameter_value then ok := true;
  end;
  assert ok, '7a a removed message was edited';
end $$;

-- 8. Participants see the placeholder; nobody can send a pre-removed message (as B)
select pg_temp.v072_as('07200000-0000-4000-8000-0000000000b2');
set local role authenticated;
do $$
declare v_id uuid;
begin
  assert (select body = 'Removed by PinHunt moderators' and removed_at is not null
            from conversation_messages where id = '07200000-0000-4000-8000-0000000000e1'), '8a sender does not see the placeholder';
  insert into conversation_messages (conversation_id, sender_id, body, removed_at)
  values ('07200000-0000-4000-8000-00000000c0ab', auth.uid(), 'verify 072 new message', now())
  returning id into v_id;
  assert (select removed_at is null from conversation_messages where id = v_id), '8b a user sent a message marked removed';
end $$;
reset role;

select pg_temp.v072_as('07200000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$ begin
  assert (select body = 'Removed by PinHunt moderators' and removed_at is not null
            from conversation_messages where id = '07200000-0000-4000-8000-0000000000e1'), '8c reporter does not see the placeholder';
end $$;
reset role;

-- 9. Admin view after removal, then after the report is dismissed (as D)
select pg_temp.v072_as('07200000-0000-4000-8000-0000000000d4');
set local role authenticated;
do $$
declare r jsonb;
begin
  r := get_reported_message('07200000-0000-4000-8000-0000000000f1');
  assert r->>'status' = 'removed', format('9a expected removed, got %s', r);
  assert r->'removal'->>'reason' = 'Harassment', '9b removal reason not shown';
  assert (select count(*) from message_moderation_events
           where message_id = '07200000-0000-4000-8000-0000000000e1') >= 3, '9c admin cannot read the record';

  delete from user_reports where id = '07200000-0000-4000-8000-0000000000f1';
  r := get_reported_message('07200000-0000-4000-8000-0000000000f1');
  assert r->>'status' = 'gone', '9d dismissed report still returns the message';
end $$;
reset role;

do $$
declare r jsonb;
begin
  -- Closed report: no more removals, and the record keeps the history.
  r := remove_reported_message('07200000-0000-4000-8000-0000000000d4', '07200000-0000-4000-8000-0000000000e1', 'again');
  assert r->>'status' = 'no_open_report', '9e removal allowed without an open report';
  assert (select count(*) from message_moderation_events
           where message_id = '07200000-0000-4000-8000-0000000000e1' and report_id is null) >= 3, '9f record lost on dismissal';

  -- Account deletion is not blocked: the sender's messages stay with no
  -- sender (051), and a deleted moderator's events keep no admin id.
  delete from auth.users where id in ('07200000-0000-4000-8000-0000000000b2', '07200000-0000-4000-8000-0000000000d4');
  assert not exists (select 1 from auth.users
                      where id in ('07200000-0000-4000-8000-0000000000b2', '07200000-0000-4000-8000-0000000000d4')), '9g account deletion blocked';
  assert (select sender_id is null and removed_at is not null
            from conversation_messages where id = '07200000-0000-4000-8000-0000000000e1'), '9h removed message changed by account deletion';
  assert not exists (select 1 from message_moderation_events where admin_id is not null
                       and message_id = '07200000-0000-4000-8000-0000000000e1'), '9i deleted moderator still named';
end $$;

select 'ALL 072 CHECKS PASSED' as result;
rollback;
