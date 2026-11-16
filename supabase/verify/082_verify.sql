-- ============================================================
-- Verification for migration 082 (events link check, #633).
-- Run in the Supabase SQL editor of the project you just applied 082 to
-- (staging first, then production), and run 081_verify.sql again too.
-- NOT read-only: it inserts two test users (auth.users, profiles) and test
-- events, then rolls everything back in one transaction. Before running it on
-- production, do the trigger check in 082_RUNBOOK.md, then set
-- target := 'production' in the project guard below.
-- Expected final output: a single row 'ALL 082 CHECKS PASSED'.
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
    raise exception 'Project guard: this is %, not %. Nothing was changed (082_RUNBOOK.md).', actual, target;
  end if;
end $$;

begin;

create or replace function pg_temp.v082_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- 1. The link check
do $$
begin
  assert exists (select 1 from pg_constraint
                  where conrelid = 'public.events'::regclass and conname = 'events_source_url_https'
                    and convalidated),
    '1a events_source_url_https missing or not validated';
  assert (select count(*) from pg_constraint
           where conrelid = 'public.events'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%source_url%') = 1,
    '1b expected exactly one check on events.source_url (081''s looser one should be gone)';
end $$;

do $$
begin
  -- Accepted: what the app accepts (its check is case-insensitive too).
  insert into public.events (title, event_date, source_url) values
    ('VERIFY082 ok', current_date, 'https://example.test/pin-trading?day=1'),
    ('VERIFY082 upper', current_date, 'HTTPS://EXAMPLE.TEST/X'),
    ('VERIFY082 none', current_date, null);

  begin
    insert into public.events (title, event_date, source_url) values ('VERIFY082 space', current_date, 'https://example.test/a b');
    raise exception '1c a link with a space was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, event_date, source_url) values ('VERIFY082 tab', current_date, E'https://example.test/\tx');
    raise exception '1d a link with a tab was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, event_date, source_url) values ('VERIFY082 newline', current_date, E'https://example.test/x\n');
    raise exception '1e a link ending in a newline was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, event_date, source_url) values ('VERIFY082 bare', current_date, 'https://');
    raise exception '1f a bare https:// was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, event_date, source_url) values ('VERIFY082 http', current_date, 'http://example.test');
    raise exception '1g an http link was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, event_date, source_url) values ('VERIFY082 js', current_date, 'javascript:alert(1)');
    raise exception '1h a javascript: link was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, event_date, source_url) values ('VERIFY082 long', current_date, 'https://' || repeat('a', 493));
    raise exception '1i a link over 500 characters was accepted';
  exception when check_violation then null;
  end;
end $$;

-- 2. is_admin(), which the events read policy calls for everyone
do $$
declare
  fn oid := to_regprocedure('public.is_admin()');
begin
  assert fn is not null, '2a public.is_admin() missing';
  assert (select prosecdef from pg_proc where oid = fn), '2b is_admin() is not SECURITY DEFINER';
  assert exists (select 1 from pg_proc, unnest(proconfig) as cfg
                  where oid = fn and cfg like 'search_path=%'),
    '2c is_admin() has no fixed search_path';
  assert has_function_privilege('anon', fn, 'execute'), '2d anon cannot execute is_admin() (the events read policy would fail)';
  assert has_function_privilege('authenticated', fn, 'execute'), '2e authenticated cannot execute is_admin()';
end $$;

insert into auth.users (id) values
  ('08200000-0000-4000-8000-0000000000a1'),
  ('08200000-0000-4000-8000-0000000000d4');
insert into profiles (id) values
  ('08200000-0000-4000-8000-0000000000a1'),
  ('08200000-0000-4000-8000-0000000000d4')
on conflict (id) do nothing;
update profiles set is_admin = false where id = '08200000-0000-4000-8000-0000000000a1';
update profiles set is_admin = true  where id = '08200000-0000-4000-8000-0000000000d4';

-- Signed out: no claims at all.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  assert public.is_admin() = false, '2f is_admin() is not false for a signed-out user';
end $$;
reset role;

select pg_temp.v082_as('08200000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
begin
  assert public.is_admin() = false, '2g is_admin() is not false for a collector';
end $$;
reset role;

select pg_temp.v082_as('08200000-0000-4000-8000-0000000000d4');
set local role authenticated;
do $$
begin
  assert public.is_admin() = true, '2h is_admin() is not true for an admin';
end $$;
reset role;

select 'ALL 082 CHECKS PASSED' as result;

rollback;
