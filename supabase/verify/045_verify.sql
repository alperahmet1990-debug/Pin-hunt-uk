-- ============================================================
-- Verification for migration 045 (run on STAGING after applying 045).
--
-- Everything runs in one transaction that is ROLLED BACK at the end, so the
-- only lasting effect is that pinhunt_id_seq advances by one (sequences are
-- not transactional). Expected final output: a single row 'ALL 045 CHECKS PASSED'.
-- Any failed check aborts with an error naming the check.
-- ============================================================
begin;

-- 1. Objects exist
do $$ begin
  assert to_regclass('public.catalogue_research_runs') is not null, '1a runs table missing';
  assert to_regclass('public.catalogue_candidates') is not null, '1b candidates table missing';
  assert to_regclass('public.catalogue_evidence') is not null, '1c evidence table missing';
  assert to_regclass('public.pinhunt_id_seq') is not null, '1d sequence missing';
  assert exists (select 1 from pg_trigger where tgname = 'pins_identity_guard' and not tgisinternal), '1e trigger missing';
  assert (select relrowsecurity from pg_class where oid = 'public.catalogue_evidence'::regclass), '1f RLS off on evidence';
  assert (select relrowsecurity from pg_class where oid = 'public.catalogue_candidates'::regclass), '1g RLS off on candidates';
  assert (select relrowsecurity from pg_class where oid = 'public.catalogue_research_runs'::regclass), '1h RLS off on runs';
end $$;

-- 2. No write policies on staging tables (writes only via the service role)
do $$ begin
  assert not exists (select 1 from pg_policies where tablename in ('catalogue_research_runs', 'catalogue_candidates', 'catalogue_evidence')
                     and cmd <> 'SELECT'), '2 unexpected write policy on staging tables';
end $$;

-- 3. next_pinhunt_id(): format, above every existing id, not callable by app roles
do $$ declare v text; mx bigint; begin
  v := next_pinhunt_id();
  assert v ~ '^PHUK-[0-9]{8,}$', '3a bad id format: ' || v;
  select coalesce(max(substring(pinhunt_id from 6)::bigint), 0) into mx from pins where pinhunt_id ~ '^PHUK-[0-9]+$';
  assert substring(v from 6)::bigint > mx, '3b minted id not above current max';
  assert not has_function_privilege('anon', 'next_pinhunt_id()', 'execute'), '3c anon can mint ids';
  assert not has_function_privilege('authenticated', 'next_pinhunt_id()', 'execute'), '3d authenticated can mint ids';
end $$;

-- 4. Identity guard on pins (test rows only; rolled back)
insert into pins (pinhunt_id, title, brand, collection, main_character, verification_status)
values ('PHUK-T0450001', 'Mickey Mouse – Animated Cutie', 'Disney Parks', 'Animated Cuties', 'Mickey Mouse', 'verified'),
       ('PHUK-T0450002', 'July 2026 – Enchanted Doors', 'Disney Parks', 'Enchanted Doors', null, 'verified'),
       ('PHUK-T0450003', 'Haunted Mansion', 'Disney Parks', 'Windows of Attraction', 'Hatbox Ghost', 'verified');

do $$ declare blocked boolean; begin
  -- 4a repurposing (the July failure) is refused
  blocked := false;
  begin
    update pins set title = 'Alice', main_character = 'Alice' where pinhunt_id = 'PHUK-T0450001';
  exception when check_violation then blocked := true; end;
  assert blocked, '4a repurposing was not refused';

  -- 4b pinhunt_id is immutable
  blocked := false;
  begin
    update pins set pinhunt_id = 'PHUK-T0450099' where pinhunt_id = 'PHUK-T0450003';
  exception when check_violation then blocked := true; end;
  assert blocked, '4b pinhunt_id change was not refused';
end $$;

-- 4c legitimate edits still work
update pins set title = 'Evil Queen hinged door', main_character = 'Evil Queen' where pinhunt_id = 'PHUK-T0450002';  -- placeholder resolved
update pins set title = 'Haunted Mansion – Windows of Attraction', main_character = 'Hatbox Ghost' where pinhunt_id = 'PHUK-T0450003';  -- refinement
update pins set title = 'Minnie Mouse – Animated Cutie' where pinhunt_id = 'PHUK-T0450001';  -- pin-editor style title fix (no main_character write)

-- 4d audited opt-in works for one transaction only
select set_config('pinhunt.allow_identity_change', 'on', true);
update pins set title = 'Alice', main_character = 'Alice' where pinhunt_id = 'PHUK-T0450001';
select set_config('pinhunt.allow_identity_change', 'off', true);

-- 5. Staging constraints
insert into catalogue_research_runs (id, engine_version, git_commit) values ('00000000-0000-4000-8000-000000000045', 'test', 'abcdef1');
insert into catalogue_candidates (id, run_id, research_key, entity_type, proposed, record_confidence)
values ('00000000-0000-4000-8000-000000000046', '00000000-0000-4000-8000-000000000045', 'brush-of-magic/mystery-series-3/zazu', 'pin', '{}', 'High');

do $$ declare blocked boolean; begin
  blocked := false;
  begin
    insert into catalogue_evidence (candidate_id, field, value, source_url, source_class, method)
    values ('00000000-0000-4000-8000-000000000046', 'characters', '["Zazu"]', 'https://pinandpop.com/pins/1', 'fan', 'search_snippet');
  exception when check_violation then blocked := true; end;
  assert blocked, '5a excluded source accepted';

  blocked := false;
  begin
    update catalogue_candidates set status = 'approved' where id = '00000000-0000-4000-8000-000000000046';
  exception when check_violation then blocked := true; end;
  assert blocked, '5b approval without verifier/decider accepted';

  blocked := false;
  begin
    insert into catalogue_evidence (candidate_id, field, value, source_class, method)
    values ('00000000-0000-4000-8000-000000000046', 'characters', '["Zazu"]', 'none', 'human_direct_check');
  exception when check_violation then blocked := true; end;
  assert blocked, '5c unattributed human check accepted';

  blocked := false;
  begin
    insert into catalogue_candidates (run_id, research_key, entity_type, proposed, record_confidence)
    values ('00000000-0000-4000-8000-000000000045', 'Bad Key/../x', 'pin', '{}', 'High');
  exception when check_violation then blocked := true; end;
  assert blocked, '5d malformed research_key accepted';
end $$;

insert into catalogue_evidence (candidate_id, field, value, source_url, source_class, method)
values ('00000000-0000-4000-8000-000000000046', 'characters', '["Zazu"]', 'https://www.disneystore.com/x', 'official', 'search_snippet');

select 'ALL 045 CHECKS PASSED' as result;
rollback;
