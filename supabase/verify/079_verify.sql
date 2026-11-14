-- ============================================================
-- Verification for migration 079 (contributed photo raw originals).
-- Run in the Supabase SQL editor of the project you just applied 079 to
-- (staging first, then production). Read-only: one transaction, rolled back.
-- Expected final output: a single row 'ALL 079 CHECKS PASSED'.
--
-- Test users (rolled back):
--   …a1  collector who uploaded the raw photo
--   …b2  another collector
--   …d4  admin
-- ============================================================

begin;

create or replace function pg_temp.v079_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- 1. Shape
do $$
begin
  assert exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pin_images' and column_name = 'raw_storage_path'
  ), '1a pin_images.raw_storage_path missing';

  assert exists (select 1 from storage.buckets where id = 'pin-contributed-raw'), '1b bucket pin-contributed-raw missing';
  assert (select public from storage.buckets where id = 'pin-contributed-raw') = false, '1c bucket pin-contributed-raw is PUBLIC';
  assert (select allowed_mime_types from storage.buckets where id = 'pin-contributed-raw') = array['image/jpeg'],
    '1c2 bucket pin-contributed-raw should accept image/jpeg only';

  -- Exactly one policy mentions the bucket: admin SELECT.
  assert (select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') || coalesce(with_check, '')) like '%pin-contributed-raw%') = 1,
    '1d expected exactly one storage policy for pin-contributed-raw';
  assert exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'pcr_storage_admin_select' and cmd = 'SELECT'
                    and qual like '%is_admin()%'),
    '1e pcr_storage_admin_select missing or not admin-gated';

  -- The account-deletion lister includes the bucket and stays service-role only.
  assert pg_get_functiondef('public.list_account_storage_objects(uuid)'::regprocedure) like '%pin-contributed-raw%',
    '1f list_account_storage_objects does not include pin-contributed-raw';
  assert not has_function_privilege('authenticated', 'public.list_account_storage_objects(uuid)', 'execute'),
    '1g authenticated can execute list_account_storage_objects';
  assert not has_function_privilege('anon', 'public.list_account_storage_objects(uuid)', 'execute'),
    '1h anon can execute list_account_storage_objects';
end $$;

-- 2. Test data (as postgres; rolled back)
insert into auth.users (id) values
  ('07900000-0000-4000-8000-0000000000a1'),
  ('07900000-0000-4000-8000-0000000000b2'),
  ('07900000-0000-4000-8000-0000000000d4');
insert into profiles (id) values
  ('07900000-0000-4000-8000-0000000000a1'),
  ('07900000-0000-4000-8000-0000000000b2'),
  ('07900000-0000-4000-8000-0000000000d4')
on conflict (id) do nothing;
update profiles set is_admin = true where id = '07900000-0000-4000-8000-0000000000d4';

insert into storage.objects (bucket_id, name, owner)
values ('pin-contributed-raw', '07900000-0000-4000-8000-0000000000a1/PHUK-VERIFY079/1.jpg',
        '07900000-0000-4000-8000-0000000000a1');

-- 3. The uploader cannot read their own raw photo
select pg_temp.v079_as('07900000-0000-4000-8000-0000000000a1');
set local role authenticated;
do $$
begin
  assert (select count(*) from storage.objects
           where bucket_id = 'pin-contributed-raw' and name like '07900000-0000-4000-8000-0000000000a1/%') = 0,
    '3a the uploader can read their raw photo';
end $$;
-- Writes too, so a broad storage.objects policy elsewhere would be caught.
do $$
declare n int;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('pin-contributed-raw', '07900000-0000-4000-8000-0000000000a1/PHUK-VERIFY079/2.jpg',
            '07900000-0000-4000-8000-0000000000a1');
    raise exception '3b a signed-in collector can upload into the raw bucket';
  exception when insufficient_privilege then
    null; -- refused by RLS, as expected
  end;
  update storage.objects set name = name where bucket_id = 'pin-contributed-raw';
  get diagnostics n = row_count;
  assert n = 0, '3c a signed-in collector can update raw photos';
  delete from storage.objects where bucket_id = 'pin-contributed-raw';
  get diagnostics n = row_count;
  assert n = 0, '3d a signed-in collector can delete raw photos';
end $$;
reset role;

-- 4. Another collector cannot read it
select pg_temp.v079_as('07900000-0000-4000-8000-0000000000b2');
set local role authenticated;
do $$
begin
  assert (select count(*) from storage.objects
           where bucket_id = 'pin-contributed-raw' and name like '07900000-0000-4000-8000-0000000000a1/%') = 0,
    '4a another collector can read a raw photo';
end $$;
reset role;

-- 5. Anonymous cannot read it
set local role anon;
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'pin-contributed-raw') = 0,
    '5a anon can read raw photos';
end $$;
reset role;

-- 6. An admin can read it
select pg_temp.v079_as('07900000-0000-4000-8000-0000000000d4');
set local role authenticated;
do $$
begin
  assert (select count(*) from storage.objects
           where bucket_id = 'pin-contributed-raw' and name like '07900000-0000-4000-8000-0000000000a1/%') = 1,
    '6a admin cannot read raw photos';
end $$;
reset role;

-- 7. Account deletion lists the raw photo for its owner only
do $$
begin
  assert (select count(*) from public.list_account_storage_objects('07900000-0000-4000-8000-0000000000a1')
           where bucket_id = 'pin-contributed-raw') = 1,
    '7a account deletion would leave the raw photo behind';
  assert (select count(*) from public.list_account_storage_objects('07900000-0000-4000-8000-0000000000b2')
           where bucket_id = 'pin-contributed-raw') = 0,
    '7b account deletion lists another user''s raw photo';
end $$;

select 'ALL 079 CHECKS PASSED' as result;

rollback;
