-- ============================================================
-- Verification for migration 048 (run on STAGING after applying 048).
--
-- One transaction, ROLLED BACK at the end: the test pins, flag change and
-- session settings leave nothing behind. Expected final output: a single row
-- 'ALL 048 CHECKS PASSED'. Any failed check aborts with an error naming it.
-- Needs at least one profile row (any user) to act as the test contributor.
-- ============================================================
begin;

-- 1. Shape: the 039 columns first, in order, then the new ones
do $$ begin
  assert (select string_agg(a, ',' order by n) from unnest(
            (select proargnames from pg_proc where proname = 'get_catalogue_image_coverage'))
            with ordinality as t(a, n))
         = 'pinhunt_id,title,set_name,release_year,edition_type,image_url,image_source,pending_count,my_status,origin,main_character,all_characters,catalogue_source,needs_back_image,missing_fields',
         '1a unexpected result columns';
  assert (select prosecdef from pg_proc where proname = 'get_catalogue_image_coverage'), '1b not SECURITY DEFINER';
  assert has_function_privilege('authenticated', 'get_catalogue_image_coverage()', 'execute'), '1c authenticated cannot execute';
end $$;

-- 2. Test data: a verified non-Collectible PinTrader pin missing info, an
--    unverified pin and an archived pin.
insert into pins (pinhunt_id, title, brand, collection, verification_status, catalogue_source, release_year, origin)
values
  ('PHUK-VERIFY48A', 'Verify 048 visible', 'Disney', '', 'verified', null, null, null),
  ('PHUK-VERIFY48B', 'Verify 048 unverified', 'Disney', 'Set', 'unverified', null, 2024, 'Disneyland Paris'),
  ('PHUK-VERIFY48C', 'Verify 048 archived', 'Disney', 'Set', 'verified', null, 2024, 'Disneyland Paris');
update pins set catalogue_status = 'archived' where pinhunt_id = 'PHUK-VERIFY48C';

-- 3. Without access: nothing
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  assert (select count(*) from get_catalogue_image_coverage()) = 0, '3 rows returned without access';
end $$;

-- 4. As a contributor with the feature open to contributors
do $$
declare uid uuid; r record;
begin
  select id into uid from profiles limit 1;
  if uid is null then raise exception '4 needs at least one profile row'; end if;
  update profiles set is_contributor = true where id = uid;
  update feature_flags set audience = 'contributor' where key = 'catalogue_contributions';
  perform set_config('request.jwt.claim.sub', uid::text, true);

  select * into r from get_catalogue_image_coverage() where pinhunt_id = 'PHUK-VERIFY48A';
  assert found, '4a verified non-Collectible PinTrader pin missing';
  assert r.missing_fields @> array['release_year', 'set', 'characters', 'origin'], '4b missing_fields wrong: ' || r.missing_fields::text;
  assert not exists (select 1 from get_catalogue_image_coverage() where pinhunt_id = 'PHUK-VERIFY48B'), '4c unverified pin returned';
  assert not exists (select 1 from get_catalogue_image_coverage() where pinhunt_id = 'PHUK-VERIFY48C'), '4d archived pin returned';
end $$;

select 'ALL 048 CHECKS PASSED' as result;
rollback;
