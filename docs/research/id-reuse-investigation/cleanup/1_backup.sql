-- Reused pinhunt_id cache cleanup (#432). Maintainer-approved 19 Oct 2026.
-- Selects exactly the rows reported by impact query Q5: caches on the 86 repurposed IDs
-- that were computed before the trusted import (2026-07-31 20:59:39Z) for the OLD seed title.
-- Expected: 10 pin_ebay_validations rows, 4 pin_market_estimates rows (2 pins x EBAY_GB/EBAY_US).
-- STEP 1 of 2. Copies the rows into schema cleanup_backup_20261019. Deletes nothing.
-- Paste this whole file into the Supabase SQL editor (production) and click Run.

begin;

create schema if not exists cleanup_backup_20261019;

create table cleanup_backup_20261019.pin_ebay_validations as
with repurposed(pinhunt_id) as (values
    ('PHUK-00000331'),
    ('PHUK-00000332'),
    ('PHUK-00000333'),
    ('PHUK-00000334'),
    ('PHUK-00000335'),
    ('PHUK-00000336'),
    ('PHUK-00000337'),
    ('PHUK-00000338'),
    ('PHUK-00000363'),
    ('PHUK-00000364'),
    ('PHUK-00000365'),
    ('PHUK-00000366'),
    ('PHUK-00000367'),
    ('PHUK-00000368'),
    ('PHUK-00000369'),
    ('PHUK-00000370'),
    ('PHUK-00000371'),
    ('PHUK-00000372'),
    ('PHUK-00000373'),
    ('PHUK-00000374'),
    ('PHUK-00000375'),
    ('PHUK-00000376'),
    ('PHUK-00000377'),
    ('PHUK-00000378'),
    ('PHUK-00000459'),
    ('PHUK-00000460'),
    ('PHUK-00000461'),
    ('PHUK-00000462'),
    ('PHUK-00000463'),
    ('PHUK-00000464'),
    ('PHUK-00000465'),
    ('PHUK-00000466'),
    ('PHUK-00000467'),
    ('PHUK-00000468'),
    ('PHUK-00000475'),
    ('PHUK-00000476'),
    ('PHUK-00000477'),
    ('PHUK-00000478'),
    ('PHUK-00000479'),
    ('PHUK-00000480'),
    ('PHUK-00000481'),
    ('PHUK-00000482'),
    ('PHUK-00000483'),
    ('PHUK-00000484'),
    ('PHUK-00000511'),
    ('PHUK-00000512'),
    ('PHUK-00000513'),
    ('PHUK-00000514'),
    ('PHUK-00000515'),
    ('PHUK-00000516'),
    ('PHUK-00000517'),
    ('PHUK-00000518'),
    ('PHUK-00000519'),
    ('PHUK-00000520'),
    ('PHUK-00000521'),
    ('PHUK-00000522'),
    ('PHUK-00000523'),
    ('PHUK-00000524'),
    ('PHUK-00000525'),
    ('PHUK-00000526'),
    ('PHUK-00000601'),
    ('PHUK-00000602'),
    ('PHUK-00000603'),
    ('PHUK-00000604'),
    ('PHUK-00000605'),
    ('PHUK-00000606'),
    ('PHUK-00000607'),
    ('PHUK-00000608'),
    ('PHUK-00000609'),
    ('PHUK-00000610'),
    ('PHUK-00000611'),
    ('PHUK-00000612'),
    ('PHUK-00000613'),
    ('PHUK-00000614'),
    ('PHUK-00000615'),
    ('PHUK-00000616'),
    ('PHUK-00000625'),
    ('PHUK-00000626'),
    ('PHUK-00000627'),
    ('PHUK-00000628'),
    ('PHUK-00000629'),
    ('PHUK-00000630'),
    ('PHUK-00000631'),
    ('PHUK-00000632'),
    ('PHUK-00000633'),
    ('PHUK-00000634')
), stale_pins as (
  select p.id from repurposed r join pins p on p.pinhunt_id = r.pinhunt_id
)
select v.* from pin_ebay_validations v
where v.pin_id in (select id from stale_pins)
  and v.created_at < timestamptz '2026-07-31 20:59:39+00';

create table cleanup_backup_20261019.pin_market_estimates as
with repurposed(pinhunt_id) as (values
    ('PHUK-00000331'),
    ('PHUK-00000332'),
    ('PHUK-00000333'),
    ('PHUK-00000334'),
    ('PHUK-00000335'),
    ('PHUK-00000336'),
    ('PHUK-00000337'),
    ('PHUK-00000338'),
    ('PHUK-00000363'),
    ('PHUK-00000364'),
    ('PHUK-00000365'),
    ('PHUK-00000366'),
    ('PHUK-00000367'),
    ('PHUK-00000368'),
    ('PHUK-00000369'),
    ('PHUK-00000370'),
    ('PHUK-00000371'),
    ('PHUK-00000372'),
    ('PHUK-00000373'),
    ('PHUK-00000374'),
    ('PHUK-00000375'),
    ('PHUK-00000376'),
    ('PHUK-00000377'),
    ('PHUK-00000378'),
    ('PHUK-00000459'),
    ('PHUK-00000460'),
    ('PHUK-00000461'),
    ('PHUK-00000462'),
    ('PHUK-00000463'),
    ('PHUK-00000464'),
    ('PHUK-00000465'),
    ('PHUK-00000466'),
    ('PHUK-00000467'),
    ('PHUK-00000468'),
    ('PHUK-00000475'),
    ('PHUK-00000476'),
    ('PHUK-00000477'),
    ('PHUK-00000478'),
    ('PHUK-00000479'),
    ('PHUK-00000480'),
    ('PHUK-00000481'),
    ('PHUK-00000482'),
    ('PHUK-00000483'),
    ('PHUK-00000484'),
    ('PHUK-00000511'),
    ('PHUK-00000512'),
    ('PHUK-00000513'),
    ('PHUK-00000514'),
    ('PHUK-00000515'),
    ('PHUK-00000516'),
    ('PHUK-00000517'),
    ('PHUK-00000518'),
    ('PHUK-00000519'),
    ('PHUK-00000520'),
    ('PHUK-00000521'),
    ('PHUK-00000522'),
    ('PHUK-00000523'),
    ('PHUK-00000524'),
    ('PHUK-00000525'),
    ('PHUK-00000526'),
    ('PHUK-00000601'),
    ('PHUK-00000602'),
    ('PHUK-00000603'),
    ('PHUK-00000604'),
    ('PHUK-00000605'),
    ('PHUK-00000606'),
    ('PHUK-00000607'),
    ('PHUK-00000608'),
    ('PHUK-00000609'),
    ('PHUK-00000610'),
    ('PHUK-00000611'),
    ('PHUK-00000612'),
    ('PHUK-00000613'),
    ('PHUK-00000614'),
    ('PHUK-00000615'),
    ('PHUK-00000616'),
    ('PHUK-00000625'),
    ('PHUK-00000626'),
    ('PHUK-00000627'),
    ('PHUK-00000628'),
    ('PHUK-00000629'),
    ('PHUK-00000630'),
    ('PHUK-00000631'),
    ('PHUK-00000632'),
    ('PHUK-00000633'),
    ('PHUK-00000634')
), stale_pins as (
  select p.id from repurposed r join pins p on p.pinhunt_id = r.pinhunt_id
)
select m.* from pin_market_estimates m
where m.pin_id in (select id from stale_pins)
  and m.calculated_at < timestamptz '2026-07-31 20:59:39+00';

-- Audit rows that point at those validations (their link is set to null on delete; kept here so rollback can restore it).
create table cleanup_backup_20261019.pin_change_audit_links as
select a.id as audit_id, a.validation_id
from pin_change_audit a
where a.validation_id in (select id from cleanup_backup_20261019.pin_ebay_validations);

-- Stops here (rolls back) unless the counts match the impact report.
do $$
declare v int; m int;
begin
  select count(*) into v from cleanup_backup_20261019.pin_ebay_validations;
  select count(*) into m from cleanup_backup_20261019.pin_market_estimates;
  if v <> 10 or m <> 4 then
    raise exception 'Unexpected counts: % validations (expected 10), % estimates (expected 4). Nothing was saved.', v, m;
  end if;
end $$;

commit;

-- Result to send back:
select 'pin_ebay_validations' as backed_up, count(*) from cleanup_backup_20261019.pin_ebay_validations
union all select 'pin_market_estimates', count(*) from cleanup_backup_20261019.pin_market_estimates
union all select 'pin_change_audit_links', count(*) from cleanup_backup_20261019.pin_change_audit_links;
