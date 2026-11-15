-- ============================================================
-- Verification for migration 081 (admin-managed events, #613).
-- Run in the Supabase SQL editor of the project you just applied 081 to
-- (staging first, then production).
-- NOT read-only: it inserts two test users (auth.users, profiles) and test
-- events, runs the checks, then rolls everything back in one transaction.
-- Rolling back undoes the rows, but a trigger on auth.users or profiles that
-- acts outside the database (an email, a webhook) would still fire. Before
-- running it on production, do the trigger check in 081_RUNBOOK.md.
-- Expected final output: a single row 'ALL 081 CHECKS PASSED'.
--
-- Test users (rolled back):
--   …a1  collector
--   …d4  admin
-- ============================================================

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
  assert has_table_privilege('anon', 'public.events', 'select'), '1i anon cannot read events';
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
  assert (select count(*) from public.events where title like 'VERIFY081%') = 1, '3a anon sees a draft (or not the published event)';
  assert not exists (select 1 from public.events where title = 'VERIFY081 draft'), '3b anon sees the draft';
end $$;
reset role;

-- 4. A collector reads published only and cannot write
select pg_temp.v081_as('08100000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
declare n int;
begin
  assert (select count(*) from public.events where title like 'VERIFY081%') = 1, '4a collector sees a draft';

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
  assert (select count(*) from public.events where title like 'VERIFY081%') = 2, '5a admin cannot see drafts';

  insert into public.events (id, title, event_date) values
    ('08100000-0000-4000-8000-00000000e003', 'VERIFY081 admin', current_date + 1);
  assert (select created_by from public.events where id = '08100000-0000-4000-8000-00000000e003')
         = '08100000-0000-4000-8000-0000000000d4', '5b created_by is not the inserting admin';
  assert not (select published from public.events where id = '08100000-0000-4000-8000-00000000e003'),
    '5c new events should start unpublished';

  -- An admin can't attribute an event to someone else.
  begin
    insert into public.events (title, event_date, created_by)
    values ('VERIFY081 spoof', current_date, '08100000-0000-4000-8000-0000000000a1');
    raise exception '5d admin inserted an event as another user';
  exception when insufficient_privilege then null;
  end;

  update public.events set published = true, created_by = '08100000-0000-4000-8000-0000000000a1'
   where id = '08100000-0000-4000-8000-00000000e003';
  get diagnostics n = row_count;
  assert n = 1, '5e admin could not publish an event';
  assert (select created_by from public.events where id = '08100000-0000-4000-8000-00000000e003')
         = '08100000-0000-4000-8000-0000000000d4', '5f created_by changed on update';

  delete from public.events where id = '08100000-0000-4000-8000-00000000e002';
  get diagnostics n = row_count;
  assert n = 1, '5g admin could not delete an event';
end $$;
reset role;

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
