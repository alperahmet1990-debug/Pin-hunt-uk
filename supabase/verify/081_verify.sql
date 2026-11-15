-- ============================================================
-- Verification for migration 081 (admin-managed events, #613).
-- Run in the Supabase SQL editor of the project you just applied 081 to
-- (staging first, then production).
-- NOT read-only: it inserts two test users (auth.users, profiles) and test
-- events, runs the checks, then rolls everything back in one transaction.
-- Rolling back undoes the rows, but a trigger on auth.users or profiles that
-- acts outside the database (an email, a webhook) would still fire. Before
-- running it on production, do the trigger check in 081_RUNBOOK.md, then
-- set target := 'production' in the project guard below.
-- Expected final output: a single row 'ALL 081 CHECKS PASSED'.
--
-- Test users (rolled back):
--   …a1  collector
--   …d4  admin
-- ============================================================

-- Project guard (#645; same as 073/079, see 073_RUNBOOK.md). Set target to
-- the project you mean. Leave it at 'staging' unless the runbook's trigger
-- check for production has passed; it stops here, before anything is
-- written, if the project's marker says otherwise.
do $$
declare
  target text := 'staging';  -- <- 'staging' or 'production'
  actual text;
begin
  if to_regprocedure('public.pinhunt_environment()') is null then
    raise exception 'Project guard: pinhunt_environment() is missing (073_RUNBOOK.md). Nothing was changed.';
  end if;
  execute 'select public.pinhunt_environment()' into actual;
  if actual is distinct from target then
    raise exception 'Project guard: this is %, not %. Nothing was changed (081_RUNBOOK.md).', actual, target;
  end if;
end $$;

begin;

create or replace function pg_temp.v081_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- 1. Shape, RLS and grants
do $$
begin
  assert to_regclass('public.events') is not null, '1a events table missing';
  assert (select relrowsecurity from pg_class where oid = 'public.events'::regclass), '1b RLS not enabled on events';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events') = 4,
    '1c expected exactly 4 policies on events';
  assert exists (select 1 from pg_policies where tablename = 'events' and policyname = 'events_select_published'
                  and cmd = 'SELECT' and qual like '%published%' and qual like '%is_admin()%'),
    '1d events_select_published missing or changed';
  assert (select count(*) from pg_policies where tablename = 'events' and cmd in ('INSERT', 'UPDATE', 'DELETE')
           and (coalesce(qual, '') || coalesce(with_check, '')) like '%is_admin()%') = 3,
    '1e a write policy on events is not admin-gated';
  assert not has_table_privilege('anon', 'public.events', 'insert'), '1f anon can insert events';
  assert not has_table_privilege('anon', 'public.events', 'update'), '1g anon can update events';
  assert not has_table_privilege('anon', 'public.events', 'delete'), '1h anon can delete events';
  assert has_column_privilege('anon', 'public.events', 'title', 'select'), '1i anon cannot read events';
  assert not has_column_privilege('anon', 'public.events', 'created_by', 'select'), '1j anon can read created_by';
  assert not has_column_privilege('authenticated', 'public.events', 'created_by', 'select'), '1k signed-in users can read created_by';
  assert not has_column_privilege('authenticated', 'public.events', 'created_by', 'insert'), '1l clients can set created_by';
  assert not has_column_privilege('authenticated', 'public.events', 'created_by', 'update'), '1m clients can change created_by';
end $$;

-- 2. Test users and events (as the table owner, bypassing RLS)
insert into auth.users (id) values
  ('08100000-0000-4000-8000-0000000000a1'),
  ('08100000-0000-4000-8000-0000000000d4');
insert into profiles (id) values
  ('08100000-0000-4000-8000-0000000000a1'),
  ('08100000-0000-4000-8000-0000000000d4')
on conflict (id) do nothing;
update profiles set is_admin = false where id = '08100000-0000-4000-8000-0000000000a1';
update profiles set is_admin = true  where id = '08100000-0000-4000-8000-0000000000d4';

insert into public.events (id, title, event_date, published) values
  ('08100000-0000-4000-8000-00000000e001', 'VERIFY081 published', current_date + 7, true),
  ('08100000-0000-4000-8000-00000000e002', 'VERIFY081 draft',     current_date + 7, false);

-- 3. Anyone sees published events only
set local role anon;
do $$
begin
  assert (select count(id) from public.events where title like 'VERIFY081%') = 1, '3a anon sees a draft (or not the published event)';
  assert not exists (select 1 from public.events where title = 'VERIFY081 draft'), '3b anon sees the draft';
end $$;
reset role;

-- 4. A collector reads published only and cannot write
select pg_temp.v081_as('08100000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
declare n int;
begin
  assert (select count(id) from public.events where title like 'VERIFY081%') = 1, '4a collector sees a draft';

  begin
    insert into public.events (title, event_date, published) values ('VERIFY081 collector', current_date, true);
    raise exception '4b collector inserted an event';
  exception when insufficient_privilege then null;
  end;

  update public.events set title = 'VERIFY081 hacked' where id = '08100000-0000-4000-8000-00000000e001';
  get diagnostics n = row_count;
  assert n = 0, '4c collector updated an event';

  delete from public.events where id = '08100000-0000-4000-8000-00000000e001';
  get diagnostics n = row_count;
  assert n = 0, '4d collector deleted an event';
end $$;
reset role;

-- 5. An admin reads drafts and can add, edit, publish and delete
select pg_temp.v081_as('08100000-0000-4000-8000-0000000000d4');
set local role authenticated;
do $$
declare n int;
begin
  assert (select count(id) from public.events where title like 'VERIFY081%') = 2, '5a admin cannot see drafts';

  -- Clients can't set id, created_by or the timestamps (column grants).
  insert into public.events (title, event_date) values ('VERIFY081 admin', current_date + 1);
  assert not (select published from public.events where title = 'VERIFY081 admin'),
    '5c new events should start unpublished';

  -- An admin can't attribute an event to someone else (no column privilege on created_by).
  begin
    insert into public.events (title, event_date, created_by)
    values ('VERIFY081 spoof', current_date, '08100000-0000-4000-8000-0000000000a1');
    raise exception '5d admin inserted an event as another user';
  exception when insufficient_privilege then null;
  end;

  update public.events set published = true where title = 'VERIFY081 admin';
  get diagnostics n = row_count;
  assert n = 1, '5e admin could not publish an event';

  begin
    update public.events set created_by = '08100000-0000-4000-8000-0000000000a1'
     where title = 'VERIFY081 admin';
    raise exception '5f admin changed created_by';
  exception when insufficient_privilege then null;
  end;

  delete from public.events where id = '08100000-0000-4000-8000-00000000e002';
  get diagnostics n = row_count;
  assert n = 1, '5g admin could not delete an event';
end $$;
reset role;

-- created_by is only readable by the table owner (here, the SQL editor).
do $$
begin
  assert (select created_by from public.events where title = 'VERIFY081 admin')
         = '08100000-0000-4000-8000-0000000000d4', '5b created_by is not the inserting admin';
end $$;

-- 6. Constraints
do $$
begin
  begin
    insert into public.events (title, event_date, end_date) values ('VERIFY081 backwards', current_date, current_date - 1);
    raise exception '6a end_date before event_date accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, event_date, source_url) values ('VERIFY081 http', current_date, 'javascript:alert(1)');
    raise exception '6b non-https source_url accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, event_date) values ('   ', current_date);
    raise exception '6c blank title accepted';
  exception when check_violation then null;
  end;
end $$;

select 'ALL 081 CHECKS PASSED' as result;

rollback;
