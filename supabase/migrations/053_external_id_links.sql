-- ============================================================
-- Migration 053: External-ID link metadata (#433, epic #431)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply, run
-- supabase/verify/053_verify.sql, and only then (separately approved)
-- production. Runbook: supabase/verify/053_RUNBOOK.md.
--
-- Purely additive. No existing table, column, policy, constraint, index or
-- row is changed or removed:
--   1. catalogue_sources: registers the source ids that pin_external_ids
--      already uses or that importers write ('pinpics', 'pintradingdb', plus
--      any other value already present). Every rights flag is false. Rows
--      that already exist (collectible_pintrader, pin_and_pop) are untouched.
--   2. pin_external_ids: nullable link-metadata columns + CHECKs. Existing
--      rows keep NULL metadata (= "legacy link, nothing recorded").
--   3. pin_external_ids.source → catalogue_sources(id) foreign key.
--   4. RLS: one new RESTRICTIVE select policy. Pin & Pop links are readable
--      only by admins while the pin_and_pop source has
--      public_display_allowed = false. The existing permissive policy
--      pin_external_ids_public_read (002, USING true) is kept as is, so every
--      other source stays readable exactly as before.
--
-- Does not touch: the 042 pin_images_pin_and_pop_reference_only check, the
-- 045 evidence_not_excluded_source check, or any catalogue_sources rights
-- flag. Does not copy any data into pin_external_ids: the Pin & Pop backfill
-- is a separate, human-run file (supabase/data/053_backfill_pin_and_pop_links.sql).
--
-- Reuses is_admin() (002), catalogue_sources (037), profiles (001).
-- Safe to run more than once. Rollback at the bottom.
-- Run AFTER 049 (050–052 are not required). In the Supabase SQL editor.
-- ============================================================

-- ── 1. Register every source id in use, with no rights ──────────────────────
-- Importers that write pin_external_ids:
--   artifacts/api-server/scripts/import-collectible-pintrader.mjs
--     → 'collectible_pintrader' (037), 'pinpics', 'pintradingdb'
--   scripts/import-catalogue.ts, scripts/bulk-import.* (legacy spreadsheet
--     imports) → free-form labels normalised to snake_case; handled by the
--     catch-all insert below for every value already in the table.
insert into catalogue_sources (
  id, display_name, attribution_text, rights_basis, exact_license_variant,
  public_display_allowed, storage_allowed, app_use_allowed, attribution_required, notes
) values
  ('pinpics', 'PinPics', null,
   'Cross-reference id only. No data, image or display rights.', null,
   false, false, false, true,
   'Registered by migration 053 so pin_external_ids.source can reference catalogue_sources. Excluded as a research source (045).'),
  ('pintradingdb', 'PinTradingDB', null,
   'Cross-reference id only. No data, image or display rights.', null,
   false, false, false, true,
   'Registered by migration 053 so pin_external_ids.source can reference catalogue_sources. Excluded as a research source (045).')
on conflict (id) do nothing;

insert into catalogue_sources (
  id, display_name, rights_basis,
  public_display_allowed, storage_allowed, app_use_allowed, attribution_required, notes
)
select distinct e.source, e.source,
       'Legacy cross-reference id only. No data, image or display rights.',
       false, false, false, true,
       'Registered by migration 053 from existing pin_external_ids rows.'
  from pin_external_ids e
 where not exists (select 1 from catalogue_sources cs where cs.id = e.source)
on conflict (id) do nothing;

-- ── 2. Link metadata (all nullable; NULL = legacy link, nothing recorded) ───
alter table pin_external_ids
  add column if not exists match_status        text,
  add column if not exists match_method        text,
  add column if not exists confidence          numeric(4,3),
  add column if not exists confirmed_by        uuid references profiles(id) on delete set null,
  add column if not exists confirmed_at        timestamptz,
  add column if not exists last_seen_at        timestamptz,   -- last time a sync saw the record upstream
  add column if not exists source_payload_hash text;          -- sha256 (hex) of the upstream record, for change detection

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass
                 and conname = 'pin_external_ids_match_status_check') then
    alter table pin_external_ids add constraint pin_external_ids_match_status_check
      check (match_status in ('proposed', 'confirmed', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass
                 and conname = 'pin_external_ids_match_method_check') then
    alter table pin_external_ids add constraint pin_external_ids_match_method_check
      check (match_method in ('pinhunt_id', 'external_id', 'exact', 'strong', 'manual'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass
                 and conname = 'pin_external_ids_confidence_check') then
    alter table pin_external_ids add constraint pin_external_ids_confidence_check
      check (confidence between 0 and 1);
  end if;
  -- A confirmed link always records when it was confirmed. confirmed_by may be
  -- null (human-run SQL has no auth.uid(); the profile may later be deleted).
  if not exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass
                 and conname = 'pin_external_ids_confirmed_at_check') then
    alter table pin_external_ids add constraint pin_external_ids_confirmed_at_check
      check (match_status is distinct from 'confirmed' or confirmed_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass
                 and conname = 'pin_external_ids_payload_hash_check') then
    alter table pin_external_ids add constraint pin_external_ids_payload_hash_check
      check (source_payload_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create index if not exists pin_external_ids_source_status_idx
  on pin_external_ids (source, match_status);

-- ── 3. source → catalogue_sources(id) ───────────────────────────────────────
-- Added NOT VALID, then validated. Step 1 registered every value present, so
-- validation is expected to pass; if a row slipped in between (e.g. a
-- concurrent import), the VALIDATE fails with the offending key and the
-- constraint stays NOT VALID but still enforced for new writes. The runbook
-- covers that case.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pin_external_ids'::regclass
                 and conname = 'pin_external_ids_source_fkey') then
    alter table pin_external_ids add constraint pin_external_ids_source_fkey
      foreign key (source) references catalogue_sources(id) not valid;
  end if;
end $$;
alter table pin_external_ids validate constraint pin_external_ids_source_fkey;

-- ── 4. RLS: Pin & Pop links are admin-only while display is not allowed ─────
-- Current state (002): RLS on; one permissive policy
--   pin_external_ids_public_read FOR SELECT USING (true)  -- anon + authenticated
-- and no insert/update/delete policy (writes are service-role only).
--
-- This adds a RESTRICTIVE select policy, which is AND-ed with that one. For a
-- client (anon or signed-in), a row is readable when:
--   • its source is not a Pin & Pop id (normalised: 'pin_and_pop', and the
--     legacy spreadsheet label 'pin_pop' / any spelling of "pin & pop")
--     → unchanged from today; or
--   • the caller is an admin (is_admin()); or
--   • that row's catalogue_sources entry has public_display_allowed = true.
--     For pin_and_pop it is false (042) and this migration does not change it.
-- The service role bypasses RLS, so importers and the API server are
-- unaffected.
drop policy if exists pin_external_ids_rights_gate on pin_external_ids;
create policy pin_external_ids_rights_gate on pin_external_ids
  as restrictive for select
  using (
    regexp_replace(lower(pin_external_ids.source), '[^a-z]', '', 'g') not in ('pinandpop', 'pinpop')
    or is_admin()
    or exists (
      select 1 from catalogue_sources cs
       where cs.id = pin_external_ids.source
         and cs.public_display_allowed
    )
  );

-- ============================================================
-- Rollback (run in this order; first run the backfill rollback in
-- supabase/data/053_backfill_pin_and_pop_links.sql if the backfill was run).
-- Dropping the columns discards any link metadata recorded since 053.
--
-- drop policy if exists pin_external_ids_rights_gate on pin_external_ids;
-- alter table pin_external_ids drop constraint if exists pin_external_ids_source_fkey;
-- drop index if exists pin_external_ids_source_status_idx;
-- alter table pin_external_ids
--   drop constraint if exists pin_external_ids_payload_hash_check,
--   drop constraint if exists pin_external_ids_confirmed_at_check,
--   drop constraint if exists pin_external_ids_confidence_check,
--   drop constraint if exists pin_external_ids_match_method_check,
--   drop constraint if exists pin_external_ids_match_status_check;
-- alter table pin_external_ids
--   drop column if exists source_payload_hash,
--   drop column if exists last_seen_at,
--   drop column if exists confirmed_at,
--   drop column if exists confirmed_by,
--   drop column if exists confidence,
--   drop column if exists match_method,
--   drop column if exists match_status;
-- delete from catalogue_sources cs
--  where cs.notes like 'Registered by migration 053%'
--    and not exists (select 1 from pin_images i where i.source = cs.id)
--    and not exists (select 1 from pin_sets s where s.catalogue_source = cs.id);
-- notify pgrst, 'reload schema';
-- ============================================================
