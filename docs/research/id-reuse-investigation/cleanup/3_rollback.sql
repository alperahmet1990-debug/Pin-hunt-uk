-- Reused pinhunt_id cache cleanup (#432). Maintainer-approved 19 Oct 2026.
-- Selects exactly the rows reported by impact query Q5: caches on the 86 repurposed IDs
-- that were computed before the trusted import (2026-07-31 20:59:39Z) for the OLD seed title.
-- Expected: 10 pin_ebay_validations rows, 4 pin_market_estimates rows (2 pins x EBAY_GB/EBAY_US).
-- ROLLBACK (only if needed). Restores the deleted rows and their audit links from the backup.

begin;

insert into pin_ebay_validations
select * from cleanup_backup_20261019.pin_ebay_validations
on conflict (id) do nothing;

-- A fresh estimate may have been calculated since; keep the newer one (unique on pin_id, marketplace).
insert into pin_market_estimates
select * from cleanup_backup_20261019.pin_market_estimates
on conflict do nothing;

update pin_change_audit a
set validation_id = l.validation_id
from cleanup_backup_20261019.pin_change_audit_links l
where a.id = l.audit_id and a.validation_id is null;

commit;
