-- ============================================================
-- Verification for migration 069 (run on STAGING after applying 069, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates a throwaway user, so it
-- leaves nothing behind. Expected final output: a single row
-- 'ALL 069 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- ============================================================
begin;

-- 1. Columns, constraints, index; access unchanged
do $$
begin
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'contributor_ai_usage'
            and column_name in ('outcome', 'chosen_pin_id', 'chosen_rank', 'outcome_at')
            and is_nullable = 'YES') = 4, '1a outcome columns missing or not nullable';
  assert exists (select 1 from pg_constraint where conname = 'cau_outcome_shape'), '1b cau_outcome_shape missing';
  assert exists (select 1 from pg_constraint where conname = 'cau_chosen_pin_id_length'), '1c cau_chosen_pin_id_length missing';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'contributor_ai_usage_scan_id_idx'), '1d scan id index missing';
  assert (select relrowsecurity from pg_class where oid = 'public.contributor_ai_usage'::regclass), '1e RLS is off';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contributor_ai_usage'), '1f a policy was added';
  assert not has_table_privilege('anon', 'public.contributor_ai_usage', 'select'), '1g anon can read usage';
  assert not has_table_privilege('authenticated', 'public.contributor_ai_usage', 'select'), '1h signed-in can read usage';
  assert not has_table_privilege('authenticated', 'public.contributor_ai_usage', 'update'), '1i signed-in can update usage';
end $$;

-- Throwaway user and scan
insert into auth.users (id) values ('06900000-0000-4000-8000-0000000000a1');
insert into profiles (id) values ('06900000-0000-4000-8000-0000000000a1') on conflict (id) do nothing;
insert into contributor_ai_usage (user_id, kind, result) values (
  '06900000-0000-4000-8000-0000000000a1', 'scan',
  '{"scanId":"0f8fad5b-d9cb-469f-a165-70867728950e","matches":[{"pinId":"A"},{"pinId":"B"}]}'
);

-- 2. Valid outcomes are accepted
do $$
declare v_id bigint;
begin
  select id into v_id from contributor_ai_usage
   where user_id = '06900000-0000-4000-8000-0000000000a1' and result->>'scanId' = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert v_id is not null, '2a scan lookup by scanId failed';
  update contributor_ai_usage set outcome = 'confirmed', chosen_pin_id = 'A', chosen_rank = 1, outcome_at = now() where id = v_id;
  update contributor_ai_usage set outcome = 'picked_alternative', chosen_pin_id = 'B', chosen_rank = 2, outcome_at = now() where id = v_id;
  update contributor_ai_usage set outcome = 'none', chosen_pin_id = null, chosen_rank = null, outcome_at = now() where id = v_id;
end $$;

-- 3. Inconsistent outcomes are refused
do $$
declare v_id bigint;
begin
  select id into v_id from contributor_ai_usage where user_id = '06900000-0000-4000-8000-0000000000a1';
  begin
    update contributor_ai_usage set outcome = 'confirmed', chosen_pin_id = 'B', chosen_rank = 2, outcome_at = now() where id = v_id;
    raise exception '3a confirmed with rank 2 was accepted';
  exception when check_violation then null; end;
  begin
    update contributor_ai_usage set outcome = 'none', chosen_pin_id = 'A', chosen_rank = null, outcome_at = now() where id = v_id;
    raise exception '3b none with a pin was accepted';
  exception when check_violation then null; end;
  begin
    update contributor_ai_usage set outcome = 'picked_alternative', chosen_pin_id = 'B', chosen_rank = 4, outcome_at = now() where id = v_id;
    raise exception '3c rank 4 was accepted';
  exception when check_violation then null; end;
  begin
    update contributor_ai_usage set outcome = 'guess', outcome_at = now() where id = v_id;
    raise exception '3d unknown outcome was accepted';
  exception when check_violation then null; end;
  begin
    update contributor_ai_usage set outcome = 'confirmed', chosen_pin_id = 'A', chosen_rank = 1, outcome_at = null where id = v_id;
    raise exception '3e outcome without outcome_at was accepted';
  exception when check_violation then null; end;
end $$;

-- 4. Only scans carry outcomes
do $$
begin
  begin
    insert into contributor_ai_usage (user_id, kind, outcome, outcome_at)
    values ('06900000-0000-4000-8000-0000000000a1', 'photo_cleanup', 'none', now());
    raise exception '4a a photo clean-up row took an outcome';
  exception when check_violation then null; end;
end $$;

-- 5. Signed-in users still can't touch the table directly
do $$
begin
  perform set_config('request.jwt.claim.sub', '06900000-0000-4000-8000-0000000000a1', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '06900000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update contributor_ai_usage set outcome = 'none', outcome_at = now();
    raise exception '5a signed-in user updated usage rows';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

select 'ALL 069 CHECKS PASSED' as result;
rollback;
