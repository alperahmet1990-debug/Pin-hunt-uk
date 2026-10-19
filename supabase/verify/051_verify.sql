-- ============================================================
-- Verification for migration 051 (run on STAGING after applying 051, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end: the three test users, test pin,
-- posts, messages, trade and audit rows leave nothing behind. The auth user
-- delete below stands in for auth.admin.deleteUser (same cascade chain).
-- Expected final output: a single row 'ALL 051 CHECKS PASSED'. Any failed
-- check aborts with an error naming it.
-- ============================================================
begin;

-- 1. Shape: detached-content columns are nullable with ON DELETE SET NULL
do $$
declare t record;
begin
  for t in select * from (values
    ('community_posts', 'author_id'),
    ('post_comments', 'author_id'),
    ('conversations', 'participant_a_id'),
    ('conversations', 'participant_b_id'),
    ('conversation_messages', 'sender_id'),
    ('ebay_validation_runs', 'started_by'),
    ('pin_ebay_validations', 'reviewed_by'),
    ('pin_change_audit', 'changed_by')) as v(tbl, col)
  loop
    assert (select is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = t.tbl and column_name = t.col) = 'YES',
           format('1a %s.%s is not nullable', t.tbl, t.col);
    assert (select count(*) from pg_constraint con
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
            where con.conrelid = ('public.' || t.tbl)::regclass and con.contype = 'f'
              and a.attname = t.col and con.confdeltype = 'n'
              and con.confrelid = 'public.profiles'::regclass) = 1,
           format('1b %s.%s is not a single ON DELETE SET NULL FK to profiles', t.tbl, t.col);
    assert (select count(*) from pg_constraint con
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
            where con.conrelid = ('public.' || t.tbl)::regclass and con.contype = 'f'
              and a.attname = t.col) = 1,
           format('1c %s.%s has more than one FK', t.tbl, t.col);
  end loop;
end $$;

-- 2. Audit table and functions: service role only
do $$
declare f text; r text; p text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.account_deletions'::regclass), '2a RLS off';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'account_deletions') = 0,
         '2b account_deletions has a policy';
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      assert not has_table_privilege(r, 'public.account_deletions', p), format('2c %s has %s', r, p);
    end loop;
  end loop;
  foreach f in array array[
    'prepare_account_deletion(uuid)',
    'finish_account_deletion(uuid, text, jsonb)',
    'list_account_storage_objects(uuid)'] loop
    foreach r in array array['anon', 'authenticated'] loop
      assert not has_function_privilege(r, 'public.' || f, 'execute'), format('2d %s can execute %s', r, f);
    end loop;
    assert has_function_privilege('service_role', 'public.' || f, 'execute'), format('2e service_role cannot execute %s', f);
  end loop;
end $$;

-- 3. Message validation triggers: INSERT unchanged, UPDATE skips detached senders
do $$ begin
  assert (select count(*) from pg_trigger where tgrelid = 'public.conversation_messages'::regclass
          and not tgisinternal and tgname in (
            'validate_conversation_message_payload_trigger',
            'validate_conversation_message_payload_update_trigger',
            'validate_conversation_photo_origins_trigger',
            'validate_conversation_photo_origins_update_trigger')) = 4, '3a triggers missing';
  assert (select count(*) from pg_trigger where tgrelid = 'public.conversation_messages'::regclass
          and tgname like '%\_update\_trigger' and pg_get_triggerdef(oid) ilike '%WHEN%sender_id IS NOT NULL%') = 2,
         '3b update triggers lack the WHEN clause';
end $$;

-- 4. Scenario data (rolled back). A = deleting user, B = other collector,
--    C = App Creator.
insert into auth.users (id, email) values
  ('05100000-0000-4000-8000-00000000000a', 'verify051-a@example.invalid'),
  ('05100000-0000-4000-8000-00000000000b', 'verify051-b@example.invalid'),
  ('05100000-0000-4000-8000-00000000000c', 'verify051-c@example.invalid');
update profiles set is_admin = true, is_app_creator = true
 where id = '05100000-0000-4000-8000-00000000000c';

insert into pins (id, pinhunt_id, title, brand, collection, verification_status) values
  ('05100000-0000-4000-8000-0000000000f1', 'PHUK-VERIFY51A', 'Verify 051 pin', 'Disney', '', 'verified');

insert into user_pins (id, user_id, pin_id, status) values
  ('05100000-0000-4000-8000-0000000000a1', '05100000-0000-4000-8000-00000000000a', '05100000-0000-4000-8000-0000000000f1', 'for_trade'),
  ('05100000-0000-4000-8000-0000000000b1', '05100000-0000-4000-8000-00000000000b', '05100000-0000-4000-8000-0000000000f1', 'owned');
insert into user_boards (user_id, id, name, pin_ids) values
  ('05100000-0000-4000-8000-00000000000a', 'b1', 'Verify board', array['PHUK-VERIFY51A']);

insert into community_posts (id, author_id, post_type, body) values
  ('05100000-0000-4000-8000-0000000000c1', '05100000-0000-4000-8000-00000000000a', 'discussion', 'Post by A'),
  ('05100000-0000-4000-8000-0000000000c2', '05100000-0000-4000-8000-00000000000b', 'discussion', 'Post by B');
insert into post_comments (id, post_id, author_id, body) values
  ('05100000-0000-4000-8000-0000000000d1', '05100000-0000-4000-8000-0000000000c2', '05100000-0000-4000-8000-00000000000a', 'Comment by A');

insert into conversations (id, participant_a_id, participant_b_id) values
  ('05100000-0000-4000-8000-0000000000e1', '05100000-0000-4000-8000-00000000000a', '05100000-0000-4000-8000-00000000000b');
insert into conversation_messages (id, conversation_id, sender_id, body, message_type, pin_ids) values
  ('05100000-0000-4000-8000-0000000000e2', '05100000-0000-4000-8000-0000000000e1', '05100000-0000-4000-8000-00000000000a', 'Hello from A', 'text', '[]'),
  ('05100000-0000-4000-8000-0000000000e3', '05100000-0000-4000-8000-0000000000e1', '05100000-0000-4000-8000-00000000000a', 'Shared a pin', 'pin_share', '["PHUK-VERIFY51A"]'),
  ('05100000-0000-4000-8000-0000000000e4', '05100000-0000-4000-8000-0000000000e1', '05100000-0000-4000-8000-00000000000b', 'Reply from B', 'text', '[]');

insert into trades (id, initiator_id, recipient_id) values
  ('05100000-0000-4000-8000-0000000000a9', '05100000-0000-4000-8000-00000000000a', '05100000-0000-4000-8000-00000000000b');
insert into trade_items (trade_id, user_pin_id, direction) values
  ('05100000-0000-4000-8000-0000000000a9', '05100000-0000-4000-8000-0000000000a1', 'offered'),
  ('05100000-0000-4000-8000-0000000000a9', '05100000-0000-4000-8000-0000000000b1', 'requested');

insert into ebay_validation_runs (id, started_by) values
  ('05100000-0000-4000-8000-0000000000aa', '05100000-0000-4000-8000-00000000000a');

-- Storage rows: optional (some hosted projects do not let postgres insert
-- into storage.objects directly). Skipped with a notice if refused.
do $$ begin
  insert into storage.objects (bucket_id, name) values
    ('community-photos', '05100000-0000-4000-8000-00000000000a/1.jpg'),
    ('pin-submissions', '05100000-0000-4000-8000-00000000000a/sub/front.jpg'),
    ('pin-catalogue', '05100000-0000-4000-8000-00000000000a/catalogue.jpg'),
    ('community-photos', '05100000-0000-4000-8000-00000000000b/1.jpg');
exception when others then
  raise notice '4s storage rows not inserted (%): storage listing check skipped', sqlerrm;
end $$;

-- 5. Refusals and no-ops
do $$
declare r jsonb;
begin
  r := prepare_account_deletion('05100000-0000-4000-8000-00000000000c');
  assert r ->> 'status' = 'refused' and r ->> 'reason' = 'app_creator', '5a app creator not refused: ' || r::text;
  assert exists (select 1 from profiles where id = '05100000-0000-4000-8000-00000000000c'), '5b app creator touched';
  r := prepare_account_deletion('05100000-0000-4000-8000-0000000000ff');
  assert r ->> 'status' = 'not_found', '5c unknown user not a no-op: ' || r::text;
  assert not exists (select 1 from account_deletions where user_id in (
    '05100000-0000-4000-8000-00000000000c', '05100000-0000-4000-8000-0000000000ff')), '5d audit row for a refusal';
end $$;

-- 6. Prepare A, list storage, delete the auth user, finish
do $$
declare r jsonb; r2 jsonb; n integer;
begin
  r := prepare_account_deletion('05100000-0000-4000-8000-00000000000a');
  assert r ->> 'status' = 'ready', '6a prepare not ready: ' || r::text;
  assert (r ->> 'posts')::int = 1 and (r ->> 'comments')::int = 1 and (r ->> 'messages')::int = 2
     and (r ->> 'conversations')::int = 1 and (r ->> 'trades')::int = 1, '6b counts wrong: ' || r::text;
  assert not exists (select 1 from trades where id = '05100000-0000-4000-8000-0000000000a9'), '6c trade not removed';

  -- Idempotent: a retry reuses the same audit row.
  r2 := prepare_account_deletion('05100000-0000-4000-8000-00000000000a');
  assert r2 ->> 'audit_id' = r ->> 'audit_id', '6d retry created a second audit row';

  if exists (select 1 from storage.objects where name like '05100000-0000-4000-8000-00000000000a/%') then
    select count(*) into n from list_account_storage_objects('05100000-0000-4000-8000-00000000000a');
    assert n = 2, format('6e expected 2 storage objects for A, got %s', n);
    assert not exists (select 1 from list_account_storage_objects('05100000-0000-4000-8000-00000000000a')
                       where bucket_id = 'pin-catalogue'), '6f catalogue object listed';
    -- Remove the test rows before the user delete (the API uses the Storage
    -- API for this). Rolled back anyway if direct deletes are refused.
    begin
      delete from storage.objects where name like '05100000-0000-4000-8000-0000000000%/%';
    exception when others then
      raise notice '6s storage rows not deleted directly (%)', sqlerrm;
    end;
  end if;
  assert (select count(*) from list_account_storage_objects(null)) = 0, '6g null user lists objects';

  delete from auth.users where id = '05100000-0000-4000-8000-00000000000a';

  perform finish_account_deletion((r ->> 'audit_id')::uuid, 'completed', '{"storage_objects": 2}'::jsonb);
  assert (select status from account_deletions where id = (r ->> 'audit_id')::uuid) = 'completed', '6h audit not completed';
  assert (select (details ->> 'storage_objects')::int from account_deletions where id = (r ->> 'audit_id')::uuid) = 2,
         '6i audit details not merged';
end $$;

-- 7. Outcome
do $$
declare a uuid := '05100000-0000-4000-8000-00000000000a';
begin
  assert not exists (select 1 from profiles where id = a), '7a profile remains';
  assert not exists (select 1 from user_pins where user_id = a), '7b collection remains';
  assert not exists (select 1 from user_boards where user_id = a), '7c boards remain';
  assert (select author_id from community_posts where id = '05100000-0000-4000-8000-0000000000c1') is null, '7d post not detached';
  assert (select author_id from post_comments where id = '05100000-0000-4000-8000-0000000000d1') is null, '7e comment not detached';
  assert (select participant_a_id from conversations where id = '05100000-0000-4000-8000-0000000000e1') is null
     and (select participant_b_id from conversations where id = '05100000-0000-4000-8000-0000000000e1')
         = '05100000-0000-4000-8000-00000000000b', '7f conversation not detached';
  assert (select count(*) from conversation_messages where conversation_id = '05100000-0000-4000-8000-0000000000e1') = 3,
         '7g messages lost';
  assert (select sender_id from conversation_messages where id = '05100000-0000-4000-8000-0000000000e3') is null
     and (select message_type from conversation_messages where id = '05100000-0000-4000-8000-0000000000e3') = 'pin_share',
         '7h pin share not kept';
  assert (select sender_id from conversation_messages where id = '05100000-0000-4000-8000-0000000000e4')
         = '05100000-0000-4000-8000-00000000000b', '7i other sender changed';
  assert exists (select 1 from user_pins where id = '05100000-0000-4000-8000-0000000000b1'), '7j other collection touched';
  assert exists (select 1 from profiles where id = '05100000-0000-4000-8000-00000000000b'), '7k other profile touched';
  assert (select started_by from ebay_validation_runs where id = '05100000-0000-4000-8000-0000000000aa') is null,
         '7l review history not detached';
  assert (prepare_account_deletion(a) ->> 'status') = 'not_found', '7m second call not a no-op';
end $$;

-- 8. A new message into the kept conversation still validates on INSERT
do $$ begin
  begin
    insert into conversation_messages (conversation_id, sender_id, body, message_type, pin_ids)
    values ('05100000-0000-4000-8000-0000000000e1', '05100000-0000-4000-8000-00000000000b', 'x', 'pin_share', '["PHUK-NOPE"]');
    assert false, '8a invalid pin share accepted';
  exception when raise_exception then null;
  end;
end $$;

select 'ALL 051 CHECKS PASSED' as result;
rollback;
