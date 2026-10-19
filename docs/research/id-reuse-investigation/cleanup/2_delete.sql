-- Reused pinhunt_id cache cleanup (#432). Maintainer-approved 19 Oct 2026.
-- Selects exactly the rows reported by impact query Q5: caches on the 86 repurposed IDs
-- that were computed before the trusted import (2026-07-31 20:59:39Z) for the OLD seed title.
-- Expected: 10 pin_ebay_validations rows, 4 pin_market_estimates rows (2 pins x EBAY_GB/EBAY_US).
-- STEP 2 of 2. Run only after 1_backup.sql succeeded. Deletes exactly the backed-up rows.

begin;

delete from pin_ebay_validations
where id in (select id from cleanup_backup_20261019.pin_ebay_validations);

delete from pin_market_estimates
where id in (select id from cleanup_backup_20261019.pin_market_estimates);

-- Stops here (rolls back) if anything other than the 14 backed-up rows would be removed.
do $$
begin
  if exists (select 1 from pin_ebay_validations where id in (select id from cleanup_backup_20261019.pin_ebay_validations))
     or exists (select 1 from pin_market_estimates where id in (select id from cleanup_backup_20261019.pin_market_estimates)) then
    raise exception 'Rows still present; rolled back.';
  end if;
end $$;

commit;

-- Result to send back (both should be 0):
select 'pin_ebay_validations remaining' as check, count(*) from pin_ebay_validations where id in (select id from cleanup_backup_20261019.pin_ebay_validations)
union all select 'pin_market_estimates remaining', count(*) from pin_market_estimates where id in (select id from cleanup_backup_20261019.pin_market_estimates);
