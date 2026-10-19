-- ============================================================
-- Verification for migration 053 (run on STAGING after applying 053, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end: the test pin, links and the
-- temporary admin flag leave nothing behind. Needs at least one profile row.
-- Expected final output: a single row 'ALL 053 CHECKS PASSED'. Any failed
-- check aborts with an error naming it.
--
-- It never changes a catalogue_sources rights flag.
-- ============================================================
begin;

-- 1. Shape: new columns, constraints, FK, policy; nothing existing removed
do $$ begin
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'pin_external_ids'
            and column_name in ('match_status', 'match_method', 'confidence', 'confirmed_by',
                                'confirmed_at', 'last_seen_at', 'source_payload_hash')
            and is_nullable = 'YES') = 7, '1a a 053 column is missing or not nullable';
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'pin_external_ids'
            and column_name in ('id', 'pin_id', 'source', 'external_id', 'created_at', 'updated_at')) = 6,
         '1b an original pin_external_ids column is missing';
  assert exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass
                 and conname = 'pin_external_ids_source_fkey' and contype = 'f' and convalidated
                 and confrelid = 'public.catalogue_sources'::regclass),
         '1c source FK missing or not validated';
  assert exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass
                 and contype = 'f' and confrelid = 'public.profiles'::regclass and confdeltype = 'n'),
         '1d confirmed_by FK missing or not ON DELETE SET NULL';
  assert (select count(*) from pg_constraint where conrelid = 'public.pin_external_ids'::regclass and contype = 'c'
            and conname in ('pin_external_ids_match_status_check', 'pin_external_ids_match_method_check',
                            'pin_external_ids_confidence_check', 'pin_external_ids_confirmed_at_check',
                            'pin_external_ids_payload_hash_check')) = 5, '1e a 053 CHECK is missing';
  -- 001 unique (pin_id, source) and 037 unique (source, external_id) still there
  assert exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass and contype = 'u'),
         '1f 001 unique (pin_id, source) missing';
  assert exists (select 1 from pg_indexes where tablename = 'pin_external_ids'
                 and indexname = 'pin_external_ids_source_external_unique'), '1g 037 unique index missing';
  -- RLS still on; the 002 public read policy is unchanged; the gate is restrictive
  assert (select relrowsecurity from pg_class where oid = 'public.pin_external_ids'::regclass), '1h RLS off';
  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pin_external_ids'
                 and policyname = 'pin_external_ids_public_read' and permissive = 'PERMISSIVE'
                 and cmd = 'SELECT' and qual = 'true'), '1i pin_external_ids_public_read changed or missing';
  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pin_external_ids'
                 and policyname = 'pin_external_ids_rights_gate' and permissive = 'RESTRICTIVE' and cmd = 'SELECT'),
         '1j pin_external_ids_rights_gate missing or not restrictive';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pin_external_ids'
            and cmd <> 'SELECT') = 0, '1k a client write policy exists on pin_external_ids';
end $$;

-- 2. Rights flags and the existing Pin & Pop exclusions are unchanged
do $$ begin
  assert exists (select 1 from catalogue_sources where id = 'pin_and_pop'
                 and not public_display_allowed and not storage_allowed and not app_use_allowed),
         '2a pin_and_pop rights flags are not all false';
  assert (select count(*) from catalogue_sources where id in ('pinpics', 'pintradingdb')
            and not public_display_allowed and not storage_allowed and not app_use_allowed) = 2,
         '2b pinpics / pintradingdb missing or have a rights flag set';
  assert not exists (select 1 from catalogue_sources where notes like 'Registered by migration 053%'
                     and (public_display_allowed or storage_allowed or app_use_allowed)),
         '2c a source registered by 053 has a rights flag set';
  assert exists (select 1 from catalogue_sources where id = 'collectible_pintrader' and public_display_allowed),
         '2d collectible_pintrader changed';
  assert not exists (select 1 from pin_external_ids e where not exists (select 1 from catalogue_sources cs where cs.id = e.source)),
         '2e a pin_external_ids.source has no catalogue_sources row';
  assert exists (select 1 from pg_constraint where conrelid = 'public.pin_images'::regclass
                 and conname = 'pin_images_pin_and_pop_reference_only'), '2f 042 check missing';
  assert exists (select 1 from pg_constraint where conrelid = 'public.catalogue_evidence'::regclass
                 and conname = 'evidence_not_excluded_source'), '2g 045 check missing';
end $$;

-- 3. Test data (rolled back)
insert into pins (pinhunt_id, title, brand, collection, verification_status)
values ('PHUK-VERIFY53A', 'Verify 053 pin', 'Disney', '', 'verified');

-- An importer-style insert (no new columns) still works and leaves NULL metadata.
insert into pin_external_ids (pin_id, source, external_id)
select id, 'collectible_pintrader', 'verify053-ctp' from pins where pinhunt_id = 'PHUK-VERIFY53A';
-- The Collectible PinTrader importer's upsert on (pin_id, source) still works.
insert into pin_external_ids (pin_id, source, external_id)
select id, 'pinpics', 'verify053-pp' from pins where pinhunt_id = 'PHUK-VERIFY53A'
on conflict (pin_id, source) do update set external_id = excluded.external_id;
insert into pin_external_ids (pin_id, source, external_id, match_status, match_method, confidence, confirmed_at)
select id, 'pin_and_pop', 'verify053-pnp', 'confirmed', 'external_id', 1, now() from pins where pinhunt_id = 'PHUK-VERIFY53A';
-- Legacy spreadsheet imports normalised "Pin & Pop: …" to source 'pin_pop'; the gate covers that spelling too.
insert into catalogue_sources (id, display_name, notes) values ('pin_pop', 'pin_pop', 'verify 053 (rolled back)')
on conflict (id) do nothing;
insert into pin_external_ids (pin_id, source, external_id)
select id, 'pin_pop', 'verify053-pnp-legacy' from pins where pinhunt_id = 'PHUK-VERIFY53A';

do $$
declare pid uuid; ok boolean;
begin
  select id into pid from pins where pinhunt_id = 'PHUK-VERIFY53A';
  assert (select match_status is null and match_method is null and confirmed_at is null
            from pin_external_ids where pin_id = pid and source = 'collectible_pintrader'),
         '3a importer-style row did not get NULL metadata';

  ok := false;
  begin
    insert into pin_external_ids (pin_id, source, external_id) values (pid, 'verify053_unknown', 'x');
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, '3b unregistered source accepted';

  ok := false;
  begin
    update pin_external_ids set match_status = 'maybe' where pin_id = pid and source = 'pinpics';
  exception when check_violation then ok := true;
  end;
  assert ok, '3c bad match_status accepted';

  ok := false;
  begin
    update pin_external_ids set match_method = 'guess' where pin_id = pid and source = 'pinpics';
  exception when check_violation then ok := true;
  end;
  assert ok, '3d bad match_method accepted';

  ok := false;
  begin
    update pin_external_ids set confidence = 1.5 where pin_id = pid and source = 'pinpics';
  exception when check_violation then ok := true;
  end;
  assert ok, '3e confidence above 1 accepted';

  ok := false;
  begin
    update pin_external_ids set match_status = 'confirmed', confirmed_at = null where pin_id = pid and source = 'pinpics';
  exception when check_violation then ok := true;
  end;
  assert ok, '3f confirmed link without confirmed_at accepted';

  ok := false;
  begin
    update pin_external_ids set source_payload_hash = 'not-a-hash' where pin_id = pid and source = 'pinpics';
  exception when check_violation then ok := true;
  end;
  assert ok, '3g malformed source_payload_hash accepted';

  update pin_external_ids set match_status = 'proposed', match_method = 'strong', confidence = 0.8,
         last_seen_at = now(), source_payload_hash = repeat('a', 64)
   where pin_id = pid and source = 'pinpics';
end $$;

-- 4. Local replay only: Supabase already grants SELECT on public tables to
--    anon/authenticated (default privileges), so this is a no-op there.
do $$ begin
  if not has_table_privilege('anon', 'public.pin_external_ids', 'select') then
    execute 'grant select on public.pin_external_ids, public.catalogue_sources to anon, authenticated';
  end if;
end $$;

-- 5. Anon: other sources readable as before, Pin & Pop link hidden
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  assert (select count(*) from pin_external_ids where external_id like 'verify053-%') = 2,
         '5a anon does not see exactly the two non-Pin & Pop test links';
  assert not exists (select 1 from pin_external_ids where source in ('pin_and_pop', 'pin_pop')), '5b anon can read a Pin & Pop link';
end $$;
reset role;

-- 6. Signed-in non-admin: same as anon. Profile flags are changed with no
--    signed-in user (as in the SQL editor), inside this rolled-back transaction.
do $$
declare uid uuid;
begin
  select id into uid from profiles order by created_at limit 1;
  if uid is null then raise exception '6 needs at least one profile row'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  update profiles set is_admin = false where id = uid;
  perform set_config('verify053.uid', uid::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
end $$;
set local role authenticated;
do $$ begin
  assert not is_admin(), '6 test profile is still an admin';
  assert (select count(*) from pin_external_ids where external_id like 'verify053-%') = 2,
         '6a signed-in non-admin does not see exactly the two non-Pin & Pop test links';
  assert not exists (select 1 from pin_external_ids where source in ('pin_and_pop', 'pin_pop')), '6b non-admin can read a Pin & Pop link';
end $$;
reset role;

-- 7. Admin (same profile, flag set inside this rolled-back transaction): sees all four
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  update profiles set is_admin = true where id = current_setting('verify053.uid')::uuid;
  perform set_config('request.jwt.claim.sub', current_setting('verify053.uid'), true);
end $$;
set local role authenticated;
do $$ begin
  assert is_admin(), '7 test profile is not an admin';
  assert (select count(*) from pin_external_ids where external_id like 'verify053-%') = 4,
         '7a admin cannot read all four test links';
end $$;
reset role;

select 'ALL 053 CHECKS PASSED' as result;
rollback;
