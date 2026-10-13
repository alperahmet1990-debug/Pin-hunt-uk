-- ============================================================
-- READ-ONLY impact check for pinhunt_ids repurposed by the
-- trusted-catalogue import (apply run 2026-07-31T20:59:39Z).
-- SELECT statements only. Nothing here writes, locks or migrates.
-- Run in the Supabase SQL editor (production or a staging restore).
--
-- A row is AT RISK when it was created BEFORE the import while its
-- pin_id/pinhunt_id pointed at the seed design, and the same id now
-- shows a different trusted design. Rows created after the import
-- were made against the trusted meaning and are fine.
-- ============================================================

with repurposed(pinhunt_id) as (values
    ('PHUK-00000331'),('PHUK-00000332'),('PHUK-00000333'),('PHUK-00000334'),('PHUK-00000335'),('PHUK-00000336'),('PHUK-00000337'),('PHUK-00000338'),('PHUK-00000363'),('PHUK-00000364'),('PHUK-00000365'),('PHUK-00000366'),('PHUK-00000367'),('PHUK-00000368'),('PHUK-00000369'),('PHUK-00000370'),('PHUK-00000371'),('PHUK-00000372'),('PHUK-00000373'),('PHUK-00000374'),('PHUK-00000375'),('PHUK-00000376'),('PHUK-00000377'),('PHUK-00000378'),('PHUK-00000459'),('PHUK-00000460'),('PHUK-00000461'),('PHUK-00000462'),('PHUK-00000463'),('PHUK-00000464'),('PHUK-00000465'),('PHUK-00000466'),('PHUK-00000467'),('PHUK-00000468'),('PHUK-00000475'),('PHUK-00000476'),('PHUK-00000477'),('PHUK-00000478'),('PHUK-00000479'),('PHUK-00000480'),('PHUK-00000481'),('PHUK-00000482'),('PHUK-00000483'),('PHUK-00000484'),('PHUK-00000511'),('PHUK-00000512'),('PHUK-00000513'),('PHUK-00000514'),('PHUK-00000515'),('PHUK-00000516'),('PHUK-00000517'),('PHUK-00000518'),('PHUK-00000519'),('PHUK-00000520'),('PHUK-00000521'),('PHUK-00000522'),('PHUK-00000523'),('PHUK-00000524'),('PHUK-00000525'),('PHUK-00000526'),('PHUK-00000601'),('PHUK-00000602'),('PHUK-00000603'),('PHUK-00000604'),('PHUK-00000605'),('PHUK-00000606'),('PHUK-00000607'),('PHUK-00000608'),('PHUK-00000609'),('PHUK-00000610'),('PHUK-00000611'),('PHUK-00000612'),('PHUK-00000613'),('PHUK-00000614'),('PHUK-00000615'),('PHUK-00000616'),('PHUK-00000625'),('PHUK-00000626'),('PHUK-00000627'),('PHUK-00000628'),('PHUK-00000629'),('PHUK-00000630'),('PHUK-00000631'),('PHUK-00000632'),('PHUK-00000633'),('PHUK-00000634')
), placeholder(pinhunt_id) as (values
    ('PHUK-00000069'),('PHUK-00000070'),('PHUK-00000071'),('PHUK-00000072'),('PHUK-00000073'),('PHUK-00000074'),('PHUK-00000075'),('PHUK-00000076'),('PHUK-00000077'),('PHUK-00000078'),('PHUK-00000079'),('PHUK-00000080'),('PHUK-00000081'),('PHUK-00000082')
), ids as (
  select p.id, p.pinhunt_id, p.title, p.collection,
         case when r.pinhunt_id is not null then 'repurposed' else 'placeholder' end as kind
  from pins p
  left join repurposed r using (pinhunt_id)
  left join placeholder l using (pinhunt_id)
  where r.pinhunt_id is not null or l.pinhunt_id is not null
)
select 'user_pins' as source, i.kind, count(*) as rows,
       count(*) filter (where u.created_at < timestamptz '2026-07-31 20:59:39+00') as created_before_import,
       count(distinct u.user_id) as users
from user_pins u join ids i on i.id = u.pin_id group by i.kind
union all
select 'external_sale_listings', i.kind, count(*),
       count(*) filter (where x.created_at < timestamptz '2026-07-31 20:59:39+00'), count(distinct x.seller_id)
from external_sale_listings x join ids i on i.id = x.pin_id group by i.kind
union all
select 'community_posts.linked_pin_id', i.kind, count(*),
       count(*) filter (where c.created_at < timestamptz '2026-07-31 20:59:39+00'), count(distinct c.author_id)
from community_posts c join ids i on i.id = c.linked_pin_id group by i.kind
union all
select 'conversations.context_pin_id', i.kind, count(*),
       count(*) filter (where c.created_at < timestamptz '2026-07-31 20:59:39+00'), null
from conversations c join ids i on i.id = c.context_pin_id group by i.kind
union all
select 'pin_market_estimates', i.kind, count(*), null, null
from pin_market_estimates m join ids i on i.id = m.pin_id group by i.kind
union all
select 'pin_images', i.kind, count(*), null, null
from pin_images m join ids i on i.id = m.pin_id group by i.kind
union all
select 'scan_attempts.matched_pin_id', i.kind, count(*),
       count(*) filter (where s.created_at < timestamptz '2026-07-31 20:59:39+00'), null
from scan_attempts s join ids i on i.id = s.matched_pin_id group by i.kind
union all
select 'user_boards (pinhunt_id arrays)', i.kind, count(*), null, count(distinct b.user_id)
from user_boards b join ids i on i.pinhunt_id = any(b.pin_ids) group by i.kind
union all
select 'trade_items (via user_pins)', i.kind, count(*),
       count(*) filter (where u.created_at < timestamptz '2026-07-31 20:59:39+00'), count(distinct u.user_id)
from trade_items t join user_pins u on u.id = t.user_pin_id join ids i on i.id = u.pin_id group by i.kind
order by 1, 2;

-- Detail of at-risk collection rows (what the user originally added vs what they see now).
-- Uses the seed workbook titles from id_reuse_classification.csv for the "before" side.
-- select u.id, u.user_id, u.status, u.created_at, p.pinhunt_id, p.title as now_shows
-- from user_pins u join pins p on p.id = u.pin_id
-- where p.pinhunt_id in (select pinhunt_id from repurposed)
--   and u.created_at < timestamptz '2026-07-31 20:59:39+00'
-- order by u.created_at;
