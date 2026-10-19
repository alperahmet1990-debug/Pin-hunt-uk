-- ============================================================
-- Backfill for migration 053 (#433): Pin & Pop ids → pin_external_ids
--
-- HUMAN-RUN ONLY, never by an agent, and never as part of a migration.
-- Staging first; production only with separate approval. Run it AFTER
-- 053_external_id_links.sql and supabase/verify/053_verify.sql have passed.
--
-- What it does
--   Copies the Pin & Pop id that the trusted-catalogue importer
--   (artifacts/api-server/scripts/import-trusted-catalogue.mjs) stores in
--   pins.external_identifiers->>'pin_and_pop' into pin_external_ids as
--     source = 'pin_and_pop', match_status = 'confirmed',
--     match_method = 'external_id', confidence = 1, confirmed_at = now().
--   These rows are readable only by admins (053 rights gate) while the
--   pin_and_pop source has public_display_allowed = false. It changes no
--   pin, no catalogue_sources row and no existing pin_external_ids row.
--
-- Which pins
--   Only the trusted-catalogue pinhunt_ids listed below (the 182 ids in
--   docs/research/id-reuse-investigation/id_reuse_classification.csv), minus
--   the 86 whose id was repurposed (classification "same series, DIFFERENT
--   design", #432). Those 86 are never linked. Everything else that carries a
--   pin_and_pop key is reported and skipped.
--   Also skipped and reported: non-numeric ids, an id held by more than one
--   pin, a pin already linked to a different Pin & Pop id, and an id already
--   linked to a different pin. Rows already linked identically are left alone,
--   so re-running is safe (idempotent).
--
-- How to run
--   1. Run the whole file as is. It ends in ROLLBACK, so it is a preview: the
--      result lists every action with its pin count and up to 10 example ids.
--   2. If the preview is right, change the last line from `rollback;` to
--      `commit;` and run it again. Expected on the trusted catalogue: up to 96
--      'insert' rows and 86 'skip: repurposed pinhunt_id (#432)'.
--   3. Rollback: the commented block at the bottom.
-- ============================================================
begin;

-- 0. Preconditions: 053 is applied and Pin & Pop has no rights.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'pin_external_ids' and column_name = 'match_status') then
    raise exception 'Migration 053 is not applied here. Stop.';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pin_external_ids'
                 and policyname = 'pin_external_ids_rights_gate') then
    raise exception 'The 053 rights gate policy is missing. Stop.';
  end if;
  if not exists (select 1 from catalogue_sources where id = 'pin_and_pop'
                 and not public_display_allowed and not storage_allowed and not app_use_allowed) then
    raise exception 'The pin_and_pop source is missing or has a rights flag set. Stop and review.';
  end if;
end $$;

-- 1. Trusted-catalogue ids that may be linked (182 - 86 = 96)
create temp table bf053_eligible (pinhunt_id text primary key) on commit drop;
insert into bf053_eligible (pinhunt_id) values
  ('PHUK-00000023'), ('PHUK-00000024'), ('PHUK-00000025'), ('PHUK-00000026'), ('PHUK-00000027'), ('PHUK-00000028'),
  ('PHUK-00000029'), ('PHUK-00000030'), ('PHUK-00000031'), ('PHUK-00000032'), ('PHUK-00000033'), ('PHUK-00000034'),
  ('PHUK-00000035'), ('PHUK-00000036'), ('PHUK-00000037'), ('PHUK-00000038'), ('PHUK-00000039'), ('PHUK-00000040'),
  ('PHUK-00000041'), ('PHUK-00000042'), ('PHUK-00000043'), ('PHUK-00000044'), ('PHUK-00000045'), ('PHUK-00000046'),
  ('PHUK-00000047'), ('PHUK-00000048'), ('PHUK-00000049'), ('PHUK-00000050'), ('PHUK-00000051'), ('PHUK-00000052'),
  ('PHUK-00000053'), ('PHUK-00000054'), ('PHUK-00000055'), ('PHUK-00000056'), ('PHUK-00000069'), ('PHUK-00000070'),
  ('PHUK-00000071'), ('PHUK-00000072'), ('PHUK-00000073'), ('PHUK-00000074'), ('PHUK-00000075'), ('PHUK-00000076'),
  ('PHUK-00000077'), ('PHUK-00000078'), ('PHUK-00000079'), ('PHUK-00000080'), ('PHUK-00000081'), ('PHUK-00000082'),
  ('PHUK-00000183'), ('PHUK-00000184'), ('PHUK-00000185'), ('PHUK-00000186'), ('PHUK-00000187'), ('PHUK-00000188'),
  ('PHUK-00000189'), ('PHUK-00000190'), ('PHUK-00000191'), ('PHUK-00000192'), ('PHUK-00000193'), ('PHUK-00000194'),
  ('PHUK-00000195'), ('PHUK-00000196'), ('PHUK-00000197'), ('PHUK-00000198'), ('PHUK-00000199'), ('PHUK-00000200'),
  ('PHUK-00000201'), ('PHUK-00000202'), ('PHUK-00000203'), ('PHUK-00000204'), ('PHUK-00000205'), ('PHUK-00000206'),
  ('PHUK-00000207'), ('PHUK-00000208'), ('PHUK-00000209'), ('PHUK-00000210'), ('PHUK-00000211'), ('PHUK-00000212'),
  ('PHUK-00000213'), ('PHUK-00000214'), ('PHUK-00000215'), ('PHUK-00000216'), ('PHUK-00000217'), ('PHUK-00000218'),
  ('PHUK-00000219'), ('PHUK-00000220'), ('PHUK-00000221'), ('PHUK-00000222'), ('PHUK-00000223'), ('PHUK-00000224'),
  ('PHUK-00000225'), ('PHUK-00000226'), ('PHUK-00000227'), ('PHUK-00000228'), ('PHUK-00000229'), ('PHUK-00000230');

-- 2. The 86 repurposed ids (#432). Never linked, whatever the list above says.
create temp table bf053_repurposed (pinhunt_id text primary key) on commit drop;
insert into bf053_repurposed (pinhunt_id) values
  ('PHUK-00000331'), ('PHUK-00000332'), ('PHUK-00000333'), ('PHUK-00000334'), ('PHUK-00000335'), ('PHUK-00000336'),
  ('PHUK-00000337'), ('PHUK-00000338'), ('PHUK-00000363'), ('PHUK-00000364'), ('PHUK-00000365'), ('PHUK-00000366'),
  ('PHUK-00000367'), ('PHUK-00000368'), ('PHUK-00000369'), ('PHUK-00000370'), ('PHUK-00000371'), ('PHUK-00000372'),
  ('PHUK-00000373'), ('PHUK-00000374'), ('PHUK-00000375'), ('PHUK-00000376'), ('PHUK-00000377'), ('PHUK-00000378'),
  ('PHUK-00000459'), ('PHUK-00000460'), ('PHUK-00000461'), ('PHUK-00000462'), ('PHUK-00000463'), ('PHUK-00000464'),
  ('PHUK-00000465'), ('PHUK-00000466'), ('PHUK-00000467'), ('PHUK-00000468'), ('PHUK-00000475'), ('PHUK-00000476'),
  ('PHUK-00000477'), ('PHUK-00000478'), ('PHUK-00000479'), ('PHUK-00000480'), ('PHUK-00000481'), ('PHUK-00000482'),
  ('PHUK-00000483'), ('PHUK-00000484'), ('PHUK-00000511'), ('PHUK-00000512'), ('PHUK-00000513'), ('PHUK-00000514'),
  ('PHUK-00000515'), ('PHUK-00000516'), ('PHUK-00000517'), ('PHUK-00000518'), ('PHUK-00000519'), ('PHUK-00000520'),
  ('PHUK-00000521'), ('PHUK-00000522'), ('PHUK-00000523'), ('PHUK-00000524'), ('PHUK-00000525'), ('PHUK-00000526'),
  ('PHUK-00000601'), ('PHUK-00000602'), ('PHUK-00000603'), ('PHUK-00000604'), ('PHUK-00000605'), ('PHUK-00000606'),
  ('PHUK-00000607'), ('PHUK-00000608'), ('PHUK-00000609'), ('PHUK-00000610'), ('PHUK-00000611'), ('PHUK-00000612'),
  ('PHUK-00000613'), ('PHUK-00000614'), ('PHUK-00000615'), ('PHUK-00000616'), ('PHUK-00000625'), ('PHUK-00000626'),
  ('PHUK-00000627'), ('PHUK-00000628'), ('PHUK-00000629'), ('PHUK-00000630'), ('PHUK-00000631'), ('PHUK-00000632'),
  ('PHUK-00000633'), ('PHUK-00000634');

do $$ begin
  if (select count(*) from bf053_eligible) <> 96 or (select count(*) from bf053_repurposed) <> 86
     or exists (select 1 from bf053_eligible join bf053_repurposed using (pinhunt_id)) then
    raise exception 'The id lists in this file are wrong. Stop.';
  end if;
end $$;

-- 3. Plan: one row per pin that carries a pin_and_pop key, plus one row per
--    eligible id with no Pin & Pop id.
create temp table bf053_plan on commit drop as
with src as (
  select p.id as pin_id, p.pinhunt_id, p.catalogue_status,
         nullif(btrim(p.external_identifiers ->> 'pin_and_pop'), '') as external_id
    from pins p
   where jsonb_typeof(p.external_identifiers) = 'object'
     and p.external_identifiers ? 'pin_and_pop'
),
dup as (
  select s.external_id
    from src s join bf053_eligible e using (pinhunt_id)
   where s.external_id ~ '^[0-9]+$'
   group by s.external_id
  having count(*) > 1
)
select s.pin_id, s.pinhunt_id, s.catalogue_status, s.external_id,
       case
         when r.pinhunt_id is not null then 'skip: repurposed pinhunt_id (#432)'
         when e.pinhunt_id is null then 'skip: not in the trusted-catalogue list'
         when s.external_id is null or s.external_id !~ '^[0-9]+$' then 'skip: not a numeric Pin & Pop id'
         when s.external_id in (select external_id from dup) then 'skip: same Pin & Pop id on more than one pin'
         when exists (select 1 from pin_external_ids x where x.pin_id = s.pin_id and x.source = 'pin_and_pop'
                      and x.external_id = s.external_id) then 'skip: already linked'
         when exists (select 1 from pin_external_ids x where x.pin_id = s.pin_id and x.source = 'pin_and_pop')
           then 'skip: pin already linked to another Pin & Pop id'
         when exists (select 1 from pin_external_ids x where x.source = 'pin_and_pop' and x.external_id = s.external_id)
           then 'skip: Pin & Pop id already linked to another pin'
         else 'insert'
       end as action
  from src s
  left join bf053_eligible e using (pinhunt_id)
  left join bf053_repurposed r using (pinhunt_id)
union all
select null, e.pinhunt_id, null, null, 'skip: eligible id has no pin or no Pin & Pop id'
  from bf053_eligible e
 where not exists (select 1 from src where src.pinhunt_id = e.pinhunt_id);

-- 4. Insert. ON CONFLICT is a backstop; the plan above already excludes clashes.
insert into pin_external_ids (pin_id, source, external_id, match_status, match_method, confidence, confirmed_at)
select pin_id, 'pin_and_pop', external_id, 'confirmed', 'external_id', 1, now()
  from bf053_plan
 where action = 'insert'
on conflict do nothing;

-- 5. Repurposed ids must never carry a Pin & Pop link.
do $$ begin
  if exists (select 1 from pin_external_ids x join pins p on p.id = x.pin_id
              join bf053_repurposed r on r.pinhunt_id = p.pinhunt_id
             where x.source = 'pin_and_pop') then
    raise exception 'A repurposed pinhunt_id has a Pin & Pop link. Nothing is committed; review before continuing.';
  end if;
end $$;

-- 6. Report
select action,
       count(*) as pins,
       string_agg(pinhunt_id, ', ' order by pinhunt_id) filter (where rn <= 10) as example_ids
  from (select *, row_number() over (partition by action order by pinhunt_id) as rn from bf053_plan) t
 group by action
union all
select 'total confirmed external_id Pin & Pop links after this run', count(*), null
  from pin_external_ids where source = 'pin_and_pop' and match_status = 'confirmed' and match_method = 'external_id'
 order by 1;

-- Preview by default. Change to `commit;` to apply.
rollback;

-- ============================================================
-- Rollback (removes only rows this backfill could have written: confirmed
-- 'external_id' Pin & Pop links with no reviewer, sync date or payload hash,
-- whose id still equals the pin's external_identifiers value). Run the
-- 053 migration rollback only after this.
--
-- begin;
-- delete from pin_external_ids x
--  using pins p
--  where p.id = x.pin_id
--    and x.source = 'pin_and_pop'
--    and x.match_status = 'confirmed'
--    and x.match_method = 'external_id'
--    and x.confirmed_by is null
--    and x.last_seen_at is null
--    and x.source_payload_hash is null
--    and x.external_id = btrim(p.external_identifiers ->> 'pin_and_pop');
-- select count(*) as pin_and_pop_links_left from pin_external_ids where source = 'pin_and_pop';
-- commit;
-- ============================================================
