-- ============================================================
-- Verification for migration 047 (run on STAGING after applying 047).
--
-- Everything runs in one transaction that is ROLLED BACK at the end, so it
-- leaves nothing behind. Expected final output: a single row
-- 'ALL 047 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- ============================================================
begin;

-- 1. Objects exist
do $$ begin
  assert to_regclass('public.contributor_ai_usage') is not null, '1a usage table missing';
  assert (select relrowsecurity from pg_class where oid = 'public.contributor_ai_usage'::regclass), '1b RLS off on usage';
  assert not exists (select 1 from pg_policies where tablename = 'contributor_ai_usage'), '1c usage table must have no policies';
  assert exists (select 1 from pg_trigger where tgname = 'pin_submissions_provenance' and not tgisinternal), '1d provenance trigger missing';
  assert (select is_nullable from information_schema.columns
           where table_name = 'pin_submissions' and column_name = 'proposed_name') = 'YES', '1e proposed_name still NOT NULL';
  assert (select is_nullable from information_schema.columns
           where table_name = 'pin_submissions' and column_name = 'brand') = 'YES', '1f brand still NOT NULL';
  assert not has_table_privilege('authenticated', 'public.contributor_ai_usage', 'select'), '1g authenticated can read usage';
  assert not has_table_privilege('anon', 'public.contributor_ai_usage', 'select'), '1h anon can read usage';
end $$;

-- 2. Photo-only insert works, provenance is captured and cannot be forged
do $$
declare uid uuid; sid uuid;
begin
  select id into uid from profiles limit 1;
  if uid is null then
    raise notice '2 skipped: no profile row to attach a test submission to';
    return;
  end if;

  insert into pin_submissions (submitted_by, front_image_path, status, rights_confirmed_at,
                               ai_identification, original_metadata)
  values (uid, uid::text || '/verify-047/front.jpg', 'submitted', now(),
          '{"matches":[{"pinId":"PHUK-00000001","confidence":42}]}',
          '{"forged":true}')
  returning id into sid;

  assert (select proposed_name is null and brand is null from pin_submissions where id = sid), '2a photo-only row not stored';
  assert (select original_metadata ? 'front_image_path' and not original_metadata ? 'forged'
            from pin_submissions where id = sid), '2b original_metadata not taken from the row';

  update pin_submissions
     set proposed_name = 'Renamed', original_metadata = '{}', ai_identification = '{}', rights_confirmed_at = null
   where id = sid;

  assert (select proposed_name = 'Renamed' from pin_submissions where id = sid), '2c ordinary edit lost';
  assert (select original_metadata->>'proposed_name' is null and original_metadata ? 'front_image_path'
            from pin_submissions where id = sid), '2d original_metadata changed by an edit';
  assert (select ai_identification ? 'matches' from pin_submissions where id = sid), '2e ai_identification changed by an edit';
  assert (select rights_confirmed_at is not null from pin_submissions where id = sid), '2f rights confirmation withdrawn by an edit';
end $$;

-- 3. Shape limits
do $$
declare uid uuid; ok boolean := false;
begin
  select id into uid from profiles limit 1;
  if uid is null then return; end if;
  begin
    insert into pin_submissions (submitted_by, front_image_path, ai_identification)
    values (uid, uid::text || '/verify-047/x.jpg', '["not an object"]');
  exception when check_violation then ok := true;
  end;
  assert ok, '3a non-object ai_identification accepted';

  ok := false;
  begin
    insert into contributor_ai_usage (user_id, kind, image_sha256) values (uid, 'scan', 'not-a-hash');
  exception when check_violation then ok := true;
  end;
  assert ok, '3b malformed image hash accepted';
end $$;

select 'ALL 047 CHECKS PASSED' as result;
rollback;
