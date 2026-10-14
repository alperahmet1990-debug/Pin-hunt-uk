-- Q0 authoritative diff — every pin whose title changed vs the pre-import backup schema backup_20260731 (independent of the workbook analysis)
-- Read-only. Paste this whole file into the Supabase SQL editor and click Run.
set default_transaction_read_only = on;

select b.id, b.pinhunt_id, b.title as before_title, p.title as now_title, p.catalogue_status,
       (select count(*) from user_pins u where u.pin_id = b.id) as user_pins_now
from backup_20260731.pins b join pins p on p.id = b.id
where lower(coalesce(b.title, '')) <> lower(coalesce(p.title, ''))
order by user_pins_now desc, b.pinhunt_id;
