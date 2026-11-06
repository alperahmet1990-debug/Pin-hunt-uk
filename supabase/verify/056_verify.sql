-- ============================================================
-- Verification for migration 056 (run on STAGING after applying 056, in the
-- Supabase SQL editor, as the default postgres user; production uses the same
-- script once 056 is approved there).
--
-- One transaction, ROLLED BACK at the end: the test auth users and their
-- profiles leave nothing behind. Expected final output: a single row
-- 'ALL 056 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- ============================================================
begin;

-- 1. No email-shaped display name remains
do $$
begin
  assert (select count(*) from public.profiles p
          left join auth.users u on u.id = p.id
          where p.display_name ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+'
             or lower(btrim(p.display_name)) = lower(u.email)) = 0,
         '1 an email-shaped display_name remains';
end $$;

-- 2. The function keeps its shape and the trigger still calls it
do $$
begin
  assert (select prosecdef from pg_proc where oid = 'public.handle_new_user()'::regprocedure),
         '2a handle_new_user is not SECURITY DEFINER';
  assert (select proconfig from pg_proc where oid = 'public.handle_new_user()'::regprocedure)
         @> array['search_path=public'],
         '2b handle_new_user lost its search_path';
  assert (select count(*) from pg_trigger
          where tgrelid = 'auth.users'::regclass and not tgisinternal
            and tgfoid = 'public.handle_new_user()'::regprocedure) = 1,
         '2c on_auth_user_created does not call handle_new_user';
end $$;

-- 3. New sign-ups: only a real name is stored
insert into auth.users (id, email, raw_user_meta_data) values
  ('56000000-0000-4000-8000-000000000001', 'verify056-a@example.com', '{}'),
  ('56000000-0000-4000-8000-000000000002', 'verify056-b@example.com', '{"display_name": ""}'),
  ('56000000-0000-4000-8000-000000000003', 'verify056-c@example.com', '{"display_name": "verify056-c@example.com"}'),
  ('56000000-0000-4000-8000-000000000004', 'verify056-d@example.com', '{"display_name": "  Pin Fan  "}'),
  ('56000000-0000-4000-8000-000000000005', 'verify056-e@example.com', null);

do $$
declare v text;
begin
  select display_name into v from public.profiles where id = '56000000-0000-4000-8000-000000000001';
  assert found and v is null, '3a no metadata should give NULL';
  select display_name into v from public.profiles where id = '56000000-0000-4000-8000-000000000002';
  assert found and v is null, '3b blank should give NULL';
  select display_name into v from public.profiles where id = '56000000-0000-4000-8000-000000000003';
  assert found and v is null, '3c email in metadata should give NULL';
  select display_name into v from public.profiles where id = '56000000-0000-4000-8000-000000000004';
  assert found and v = 'Pin Fan', '3d a real name should be kept, trimmed';
  select display_name into v from public.profiles where id = '56000000-0000-4000-8000-000000000005';
  assert found and v is null, '3e NULL metadata should give NULL';
end $$;

select 'ALL 056 CHECKS PASSED' as result;

rollback;
