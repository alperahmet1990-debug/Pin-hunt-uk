# Live-catalogue baseline for duplicate checks (restart-safe)

Duplicate checks never depend on files in the container. They read a versioned baseline committed to the research branch:
`research/catalogue-engine/baseline/live_catalogue_fingerprint.json`.

## What it contains

- **Header:**
  - version and export date;
  - `max_age_days` (14);
  - SHA-256 of the export it came from;
  - row counts.
- **One entry per non-seed live pin (4,257 of 15,978):**
  - `pinhunt_id`, year, and public/archived;
  - a coarse line and edition category;
  - **12-character SHA-256 fingerprints** of the normalised title, collection and character words.

No readable titles, collections or characters are stored.

**What the fingerprints allow:** the matcher compares fingerprints exactly as it compared words. Verified 16 Oct 2026: identical results to the raw export on all 2,113 candidates (84 matches, 0 differences).

**What they don't hide:** fingerprints of common words could be guessed by brute force, so this is not secrecy. But no record can be read back as text. The trusted rows' facts were already in the repo in readable form, in the trusted workbook under `attached_assets/`.

**Left out:**
- 11,721 synthetic seed rows (edition "Seed");
- user data;
- prices;
- images;
- URLs;
- credentials.

## Pause rule

`tools/live_match.py` and `tools/backfill_report.py` stop with **exit code 3, "DUPLICATE CHECK PAUSED"** when the baseline is:
- missing;
- unreadable;
- older than `max_age_days`.

The hourly routine then validates nothing new. It keeps packets uncommitted to totals and asks the maintainer to refresh. It never skips duplicate checks. Tests: `research/catalogue-engine/tests/test_live_baseline.py`.

## Refresh (read-only, maintainer, about 2 minutes)

Refresh every 14 days, or straight after any production import.

1. In the Supabase SQL editor (production), run the query below and check that it returns 80 rows. Then use **Export → Download CSV**.
2. Share the CSV in the research session. Claude runs `python3 tools/build_live_baseline.py <csv> <YYYY-MM-DD>`, checks the counts and commits the new baseline.

The export is read-only. No credentials are involved: the maintainer runs it in their own dashboard.

```sql
with t as (
  select p.pinhunt_id, p.title, p.collection, p.origin, p.edition_type, p.release_year,
         p.main_character, p.all_characters, p.catalogue_source, p.is_searchable,
         coalesce(p.is_legacy_v1, false) as legacy,
         exists (select 1 from pin_images i where i.pin_id = p.id and i.public_display_allowed) as public_img,
         (row_number() over (order by p.pinhunt_id) - 1) / 200 as chunk
  from pins p
)
select chunk, count(*) as n,
       json_agg(json_build_object('id', pinhunt_id, 't', title, 'c', collection, 'o', origin, 'e', edition_type,
         'y', release_year, 'm', main_character, 'a', all_characters, 's', catalogue_source,
         'v', is_searchable, 'l', legacy, 'i', public_img) order by pinhunt_id)::text as pins
from t group by chunk order by chunk;
```

The agent guard blocks sessions from contacting hosted Supabase directly, so the refresh deliberately goes through the maintainer. No new credentials or write paths were added.
