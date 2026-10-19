-- ============================================================
-- Verification for migration 052 (run on STAGING after applying 052, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end: the test users, profiles, run,
-- candidates, pin and events leave nothing behind. Expected final output: a
-- single row 'ALL 052 CHECKS PASSED'. Any failed check aborts with an error
-- naming it.
--
-- Local PGlite replay only: run 052_replay_setup.sql first, so service_role
-- has the grants and RLS bypass it has on Supabase.
-- ============================================================
begin;

-- 1. Shape: table, RLS, a single read policy, triggers, indexes
do $$ begin
  assert to_regclass('public.catalogue_review_events') is not null, '1a table missing';
  assert (select relrowsecurity from pg_class where oid = 'public.catalogue_review_events'::regclass), '1b RLS off';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'catalogue_review_events') = 1
     and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'catalogue_review_events'
                 and policyname = 'catalogue_review_events_read' and cmd = 'SELECT'), '1c expected exactly one SELECT policy';
  assert (select count(*) from pg_trigger where tgrelid = 'public.catalogue_review_events'::regclass and not tgisinternal
          and tgname in ('catalogue_review_events_insert', 'catalogue_review_events_no_change',
                         'catalogue_review_events_no_truncate')) = 3, '1d trigger missing';
  assert to_regclass('public.catalogue_review_events_candidate_idx') is not null
     and to_regclass('public.catalogue_review_events_run_idx') is not null
     and to_regclass('public.catalogue_review_events_pin_idx') is not null, '1e index missing';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'catalogue_candidates' and column_name in ('review_lane', 'suggestions')),
         '1f deferred review-lane columns present';
  assert (select is_nullable from information_schema.columns where table_schema = 'public'
          and table_name = 'catalogue_review_events' and column_name = 'actor') = 'YES', '1g actor not nullable';
  -- Foreign keys: restrict for subjects, set null for actor
  assert (select confdeltype from pg_constraint where conrelid = 'public.catalogue_review_events'::regclass
          and contype = 'f' and confrelid = 'public.catalogue_candidates'::regclass) = 'r', '1h candidate FK not restrict';
  assert (select confdeltype from pg_constraint where conrelid = 'public.catalogue_review_events'::regclass
          and contype = 'f' and confrelid = 'public.catalogue_research_runs'::regclass) = 'r', '1i run FK not restrict';
  assert (select confdeltype from pg_constraint where conrelid = 'public.catalogue_review_events'::regclass
          and contype = 'f' and confrelid = 'public.pins'::regclass) = 'r', '1j pin FK not restrict';
  assert (select confdeltype from pg_constraint where conrelid = 'public.catalogue_review_events'::regclass
          and contype = 'f' and confrelid = 'public.profiles'::regclass) = 'n', '1k actor FK not set null';
end $$;

-- 2. Grants: app roles cannot write; anon cannot read; functions not callable
do $$
declare r text; p text; f text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['insert', 'update', 'delete', 'truncate'] loop
      assert not has_table_privilege(r, 'public.catalogue_review_events', p), format('2a %s has %s', r, p);
    end loop;
    foreach f in array array['catalogue_review_events_before_insert()', 'catalogue_review_events_append_only()',
                             'catalogue_review_events_no_truncate()'] loop
      assert not has_function_privilege(r, 'public.' || f, 'execute'), format('2b %s can execute %s', r, f);
    end loop;
  end loop;
  assert not has_table_privilege('anon', 'public.catalogue_review_events', 'select'), '2c anon can select';
  assert has_table_privilege('authenticated', 'public.catalogue_review_events', 'select'), '2d authenticated cannot select';
  -- Preconditions for section 7 (true on Supabase; the replay setup provides them locally)
  assert (select rolbypassrls from pg_roles where rolname = 'service_role'), '2e service_role does not bypass RLS';
  assert has_table_privilege('service_role', 'public.catalogue_review_events', 'insert')
     and has_table_privilege('service_role', 'public.catalogue_review_events', 'update')
     and has_table_privilege('service_role', 'public.catalogue_review_events', 'delete'), '2f service_role lacks table grants';
end $$;

-- 3. Test data (rolled back). Two users: U1 admin (deleted via auth.users),
--    U2 non-admin (profile deleted directly).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000052001', 'verify-052-a@example.invalid'),
  ('00000000-0000-4000-8000-000000052002', 'verify-052-b@example.invalid');
insert into profiles (id) values ('00000000-0000-4000-8000-000000052001'), ('00000000-0000-4000-8000-000000052002')
  on conflict (id) do nothing;
update profiles set is_admin = true where id = '00000000-0000-4000-8000-000000052001';

insert into catalogue_research_runs (id, engine_version, git_commit) values
  ('00000000-0000-4000-8000-000000052101', 'verify-052', 'abcdef1'),
  ('00000000-0000-4000-8000-000000052102', 'verify-052', 'abcdef2');
insert into catalogue_candidates (id, run_id, research_key, entity_type, proposed, record_confidence) values
  ('00000000-0000-4000-8000-000000052201', '00000000-0000-4000-8000-000000052101', 'verify-052/one', 'pin', '{}', 'High'),
  ('00000000-0000-4000-8000-000000052202', '00000000-0000-4000-8000-000000052102', 'verify-052/two', 'pin', '{}', 'High');
insert into pins (id, pinhunt_id, title, brand, collection, verification_status)
values ('00000000-0000-4000-8000-000000052301', 'PHUK-VERIFY52A', 'Verify 052 pin', 'Disney', '', 'verified');

-- 4. Valid inserts (owner): candidate event, pin mapping event, both subjects
insert into catalogue_review_events (id, candidate_id, actor, action, from_status, to_status, fields, notes, created_at)
values ('00000000-0000-4000-8000-000000052401', '00000000-0000-4000-8000-000000052201',
        '00000000-0000-4000-8000-000000052001', 'decision', 'needs_more_research', 'approved', '{title}', 'verify',
        '2000-01-01T00:00:00Z');
insert into catalogue_review_events (id, pin_id, external_source, external_id, actor, action)
values ('00000000-0000-4000-8000-000000052402', '00000000-0000-4000-8000-000000052301', 'verify_source', 'X-1',
        '00000000-0000-4000-8000-000000052002', 'link_external');
insert into catalogue_review_events (id, candidate_id, pin_id, actor, action)
values ('00000000-0000-4000-8000-000000052403', '00000000-0000-4000-8000-000000052202',
        '00000000-0000-4000-8000-000000052301', '00000000-0000-4000-8000-000000052002', 'import');

do $$ begin
  assert (select run_id from catalogue_review_events where id = '00000000-0000-4000-8000-000000052401')
         = '00000000-0000-4000-8000-000000052101', '4a run_id not filled from the candidate';
  assert (select created_at from catalogue_review_events where id = '00000000-0000-4000-8000-000000052401')
         > '2000-01-02'::timestamptz, '4b created_at was not set to the insert time';
end $$;

-- 5. Constraints: subject, external pair, mapping actions, run consistency
do $$
declare blocked boolean;
begin
  blocked := false;
  begin
    insert into catalogue_review_events (action) values ('decision');
  exception when check_violation then blocked := true; end;
  assert blocked, '5a event without a subject accepted';

  blocked := false;
  begin
    insert into catalogue_review_events (candidate_id, external_source, external_id, action)
    values ('00000000-0000-4000-8000-000000052201', 'verify_source', 'X-1', 'reject_match');
  exception when check_violation then blocked := true; end;
  assert blocked, '5b mapping action without a pin accepted';

  blocked := false;
  begin
    insert into catalogue_review_events (pin_id, external_source, action)
    values ('00000000-0000-4000-8000-000000052301', 'verify_source', 'decision');
  exception when check_violation then blocked := true; end;
  assert blocked, '5c external_source without external_id accepted';

  blocked := false;
  begin
    insert into catalogue_review_events (pin_id, action) values ('00000000-0000-4000-8000-000000052301', 'unlink_external');
  exception when check_violation then blocked := true; end;
  assert blocked, '5d mapping action without an external record accepted';

  blocked := false;
  begin
    insert into catalogue_review_events (candidate_id, run_id, action)
    values ('00000000-0000-4000-8000-000000052201', '00000000-0000-4000-8000-000000052102', 'decision');
  exception when check_violation then blocked := true; end;
  assert blocked, '5e run_id not matching the candidate accepted';

  blocked := false;
  begin
    insert into catalogue_review_events (pin_id, action) values ('00000000-0000-4000-8000-000000052301', 'delete_everything');
  exception when check_violation then blocked := true; end;
  assert blocked, '5f unknown action accepted';

  blocked := false;
  begin
    insert into catalogue_review_events (pin_id, action, notes)
    values ('00000000-0000-4000-8000-000000052301', 'correct', repeat('x', 2001));
  exception when check_violation then blocked := true; end;
  assert blocked, '5g over-long notes accepted';
end $$;

-- 6. Append-only for the owner: update, delete, truncate and a manual
--    actor := null are all refused
do $$
declare blocked boolean;
begin
  blocked := false;
  begin
    update catalogue_review_events set notes = 'changed' where id = '00000000-0000-4000-8000-000000052401';
  exception when raise_exception then blocked := sqlerrm like '%append-only%'; end;
  assert blocked, '6a owner update not refused';

  blocked := false;
  begin
    delete from catalogue_review_events where id = '00000000-0000-4000-8000-000000052401';
  exception when raise_exception then blocked := sqlerrm like '%append-only%'; end;
  assert blocked, '6b owner delete not refused';

  blocked := false;
  begin
    truncate catalogue_review_events;
  exception when raise_exception then blocked := sqlerrm like '%append-only%'; end;
  assert blocked, '6c owner truncate not refused';

  blocked := false;
  begin
    update catalogue_review_events set actor = null where id = '00000000-0000-4000-8000-000000052401';
  exception when raise_exception then blocked := sqlerrm like '%append-only%'; end;
  assert blocked, '6d direct actor := null not refused';
end $$;

-- 7. Service role: may insert; update and delete are refused
set local role service_role;
insert into catalogue_review_events (id, candidate_id, action)
values ('00000000-0000-4000-8000-000000052404', '00000000-0000-4000-8000-000000052201', 'skip');
do $$
declare blocked boolean;
begin
  blocked := false;
  begin
    update catalogue_review_events set to_status = 'rejected' where id = '00000000-0000-4000-8000-000000052404';
  exception when raise_exception then blocked := sqlerrm like '%append-only%'; end;
  assert blocked, '7a service_role update not refused';

  blocked := false;
  begin
    delete from catalogue_review_events where id = '00000000-0000-4000-8000-000000052401';
  exception when raise_exception then blocked := sqlerrm like '%append-only%'; end;
  assert blocked, '7b service_role delete not refused';
end $$;
reset role;

-- 8. anon and authenticated (even an admin) cannot write; only admins read
set local role anon;
do $$
declare blocked boolean;
begin
  blocked := false;
  begin
    insert into catalogue_review_events (pin_id, action) values ('00000000-0000-4000-8000-000000052301', 'correct');
  exception when insufficient_privilege then blocked := true; end;
  assert blocked, '8a anon insert not refused';

  blocked := false;
  begin
    update catalogue_review_events set notes = 'x';
  exception when insufficient_privilege then blocked := true; end;
  assert blocked, '8b anon update not refused';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000052001', true);  -- admin
do $$
declare blocked boolean;
begin
  assert (select count(*) from catalogue_review_events where id::text like '00000000-0000-4000-8000-0000000524%') = 4,
         '8c admin cannot read events';

  blocked := false;
  begin
    insert into catalogue_review_events (pin_id, action) values ('00000000-0000-4000-8000-000000052301', 'correct');
  exception when insufficient_privilege then blocked := true; end;
  assert blocked, '8d authenticated insert not refused';

  blocked := false;
  begin
    update catalogue_review_events set notes = 'x';
  exception when insufficient_privilege then blocked := true; end;
  assert blocked, '8e authenticated update not refused';

  blocked := false;
  begin
    delete from catalogue_review_events;
  exception when insufficient_privilege then blocked := true; end;
  assert blocked, '8f authenticated delete not refused';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000052002', true);  -- non-admin
do $$ begin
  assert (select count(*) from catalogue_review_events) = 0, '8g non-admin can read events';
end $$;
select set_config('request.jwt.claim.sub', '', true);
reset role;

-- 9. Deleting a candidate, a run or a pin that has events is refused; the events stay
do $$
declare blocked boolean;
begin
  blocked := false;
  begin
    delete from catalogue_candidates where id = '00000000-0000-4000-8000-000000052201';
  exception when restrict_violation or foreign_key_violation then blocked := true; end;
  assert blocked, '9a candidate delete not refused';

  blocked := false;
  begin
    delete from catalogue_research_runs where id = '00000000-0000-4000-8000-000000052101';
  exception when restrict_violation or foreign_key_violation then blocked := true; end;
  assert blocked, '9b run delete (cascading to candidates) not refused';

  blocked := false;
  begin
    delete from pins where id = '00000000-0000-4000-8000-000000052301';
  exception when restrict_violation or foreign_key_violation then blocked := true; end;
  assert blocked, '9c pin delete not refused';

  assert (select count(*) from catalogue_review_events where id::text like '00000000-0000-4000-8000-0000000524%') = 4,
         '9d events lost';
  assert exists (select 1 from catalogue_candidates where id = '00000000-0000-4000-8000-000000052201'), '9e candidate lost';
end $$;

-- 10. Deleting a profile (directly, or through auth.users) keeps its events, actor null
delete from profiles where id = '00000000-0000-4000-8000-000000052002';
delete from auth.users where id = '00000000-0000-4000-8000-000000052001';
do $$ begin
  assert (select count(*) from catalogue_review_events where id::text like '00000000-0000-4000-8000-0000000524%') = 4,
         '10a events lost on profile deletion';
  assert not exists (select 1 from catalogue_review_events where id::text like '00000000-0000-4000-8000-0000000524%'
                     and actor is not null), '10b actor not cleared';
  assert (select action || '/' || to_status || '/' || notes || '/' || fields[1] from catalogue_review_events
          where id = '00000000-0000-4000-8000-000000052401') = 'decision/approved/verify/title', '10c event content changed';
  assert (select external_source || ':' || external_id from catalogue_review_events
          where id = '00000000-0000-4000-8000-000000052402') = 'verify_source:X-1', '10d mapping event changed';
end $$;

select 'ALL 052 CHECKS PASSED' as result;
rollback;
