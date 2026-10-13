"""Generates impact_queries.sql (SELECT-only) from id_reuse_classification.csv.
Run: python3 docs/research/id-reuse-investigation/build_impact_sql.py"""
import pathlib
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
CUTOFF = "2026-07-31 20:59:39+00"   # trusted-import apply run (attached_assets/trusted-import-log-apply-*.json)
d = pd.read_csv(HERE / "id_reuse_classification.csv")
d = d[~d["risk"].str.startswith("NONE")]
q = lambda s: "'" + str(s).replace("'", "''") + "'"
values = ",\n    ".join(f"({q(r.pinhunt_id)}, {q('repurposed' if r.risk.startswith('HIGH') else 'placeholder')}, "
                       f"{q(r['before_title (seed)'])}, {q(r['after_title (trusted)'])})" for _, r in d.iterrows())
CTE = f"""with reused(pinhunt_id, kind, before_title, after_title) as (values
    {values}
), ids as (
  select p.id, p.pinhunt_id, r.kind, r.before_title, r.after_title, p.title as current_title,
         p.catalogue_status, p.is_searchable
  from reused r join pins p on p.pinhunt_id = r.pinhunt_id
)"""
CUT = f"timestamptz '{CUTOFF}'"
queries = {
"Q0 authoritative diff — every pin whose title changed vs the pre-import backup schema backup_20260731 (independent of the workbook analysis)": """select b.id, b.pinhunt_id, b.title as before_title, p.title as now_title, p.catalogue_status,
       (select count(*) from user_pins u where u.pin_id = b.id) as user_pins_now
from backup_20260731.pins b join pins p on p.id = b.id
where lower(coalesce(b.title, '')) <> lower(coalesce(p.title, ''))
order by user_pins_now desc, b.pinhunt_id;""",
"Q1 sanity — do the reused rows still carry the trusted ('after') titles? Expect 100 rows, title_is_after = true": f"""{CTE}
select pinhunt_id, kind, before_title, after_title, current_title,
       (lower(current_title) = lower(after_title)) as title_is_after, catalogue_status, is_searchable
from ids order by kind, pinhunt_id;""",
"Q2 impact summary — rows per table pointing at reused ids, and how many predate the import (= at risk)": f"""{CTE}
select 'user_pins' as source, i.kind, count(*) as rows, count(*) filter (where u.created_at < {CUT}) as created_before_import, count(distinct u.user_id) as users
  from user_pins u join ids i on i.id = u.pin_id group by i.kind
union all select 'trade_items (via user_pins)', i.kind, count(*), count(*) filter (where u.created_at < {CUT}), count(distinct u.user_id)
  from trade_items t join user_pins u on u.id = t.user_pin_id join ids i on i.id = u.pin_id group by i.kind
union all select 'external_sale_listings', i.kind, count(*), count(*) filter (where x.created_at < {CUT}), count(distinct x.seller_id)
  from external_sale_listings x join ids i on i.id = x.pin_id group by i.kind
union all select 'community_posts.linked_pin_id', i.kind, count(*), count(*) filter (where c.created_at < {CUT}), count(distinct c.author_id)
  from community_posts c join ids i on i.id = c.linked_pin_id group by i.kind
union all select 'conversations.context_pin_id', i.kind, count(*), count(*) filter (where c.created_at < {CUT}), null
  from conversations c join ids i on i.id = c.context_pin_id group by i.kind
union all select 'user_boards (pinhunt_id arrays)', i.kind, count(*), count(*) filter (where b.created_at < {CUT}), count(distinct b.user_id)
  from user_boards b join ids i on i.pinhunt_id = any(b.pin_ids) group by i.kind
union all select 'pin_market_estimates (cache)', i.kind, count(*), count(*) filter (where m.calculated_at < {CUT}), null
  from pin_market_estimates m join ids i on i.id = m.pin_id group by i.kind
union all select 'pin_images', i.kind, count(*), count(*) filter (where m.created_at < {CUT}), null
  from pin_images m join ids i on i.id = m.pin_id group by i.kind
union all select 'scan_attempts.matched_pin_id', i.kind, count(*), count(*) filter (where s.created_at < {CUT}), null
  from scan_attempts s join ids i on i.id = s.matched_pin_id group by i.kind
order by 1, 2;""",
"Q3 detail — collection rows at risk (added before the import, now showing a different design)": f"""{CTE}
select u.id as user_pin_id, u.user_id, u.status, u.created_at, i.pinhunt_id,
       i.before_title as user_originally_added, i.current_title as now_shows
from user_pins u join ids i on i.id = u.pin_id
where i.kind = 'repurposed' and u.created_at < {CUT}
order by u.created_at;""",
"Q4 detail — listings and community posts at risk": f"""{CTE}
select 'external_sale_listing' as kind_of_record, x.id::text, x.created_at, i.pinhunt_id, i.before_title, i.current_title
  from external_sale_listings x join ids i on i.id = x.pin_id where i.kind = 'repurposed' and x.created_at < {CUT}
union all
select 'community_post', c.id::text, c.created_at, i.pinhunt_id, i.before_title, i.current_title
  from community_posts c join ids i on i.id = c.linked_pin_id where i.kind = 'repurposed' and c.created_at < {CUT}
order by 3;""",
"Q5 stale caches — market estimates and eBay validations computed for the old (seed) title": f"""{CTE}
select 'pin_market_estimates' as cache, i.pinhunt_id, i.before_title, i.current_title, m.calculated_at as computed_at
  from pin_market_estimates m join ids i on i.id = m.pin_id where i.kind = 'repurposed' and m.calculated_at < {CUT}
union all
select 'pin_ebay_validations', i.pinhunt_id, i.before_title, i.current_title, v.created_at
  from pin_ebay_validations v join ids i on i.id = v.pin_id where i.kind = 'repurposed' and v.created_at < {CUT}
order by 2;""",
}
out = [f"""-- ============================================================
-- READ-ONLY impact queries for pinhunt_ids reused by the trusted-catalogue
-- import (apply run {CUTOFF}). Generated by build_impact_sql.py.
--
-- SELECT statements only: nothing here inserts, updates, deletes, locks
-- or migrates. For extra safety, run this first in the same SQL-editor tab:
--     set session characteristics as transaction read only;
-- The Supabase SQL editor shows only the LAST result of a multi-statement
-- run, so run each numbered query on its own.
--
-- 'repurposed'  = the id now means a different design (86 ids)
-- 'placeholder' = a month placeholder became the specific pin (14 ids)
-- A record is AT RISK when it was created before the import.
-- ============================================================
"""]
for title, sql in queries.items():
    out.append(f"\n-- ── {title} ──\n{sql}\n")
(HERE / "impact_queries.sql").write_text("".join(out))
print("wrote", len(queries), "queries for", len(d), "ids")
