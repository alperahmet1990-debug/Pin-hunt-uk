"""Build the versioned, restart-safe live-catalogue baseline used for duplicate checks.

Input: the read-only 80-row chunked export of `pins` from the Supabase SQL editor (see
docs/research/catalogue-backfill/BASELINE.md). Output: baseline/live_catalogue_fingerprint.json.

The baseline holds no readable catalogue text: every title, collection and character word is
stored only as a truncated SHA-256 fingerprint, which is all the duplicate matcher needs.
Synthetic seed rows (edition "Seed") are left out. No credentials are involved.

Usage: python3 tools/build_live_baseline.py <export.csv> <export-date YYYY-MM-DD>
"""
import csv, hashlib, json, os, sys, datetime
sys.path.insert(0, os.path.dirname(__file__))
from live_match import toks, chars, fp, live_chars  # same normalisation as the matcher
from backfill_report import line_from_live, edition  # coarse categories for the coverage counts

OUT = os.path.join(os.path.dirname(__file__), '..', 'baseline', 'live_catalogue_fingerprint.json')

def main(path, date):
    datetime.date.fromisoformat(date)
    csv.field_size_limit(10**9)
    raw = open(path, 'rb').read()
    rows = list(csv.DictReader(raw.decode('utf-8').splitlines()))
    pins = [p for r in rows for p in json.loads(r['pins'])]
    stated = sum(int(r['n']) for r in rows)
    if stated != len(pins) or len({p['id'] for p in pins}) != len(pins):
        sys.exit(f'export incomplete or inconsistent: chunks say {stated}, parsed {len(pins)}')
    keep = [p for p in pins if p.get('e') != 'Seed']
    out = {
        'version': date, 'exported_at': date, 'max_age_days': 14,
        'source': 'Supabase production table pins, read-only chunked export (80 rows x 200) run by the maintainer',
        'export_sha256': hashlib.sha256(raw).hexdigest(),
        'rows_total': len(pins), 'rows_public': sum(1 for p in pins if p.get('v')),
        'rows_seed_excluded': len(pins) - len(keep), 'rows_indexed': len(keep),
        'note': 'Fingerprints only (truncated SHA-256 of normalised words); no readable catalogue text.',
        'pins': [{'id': p['id'], 'y': p.get('y'), 'k': 'public' if p.get('v') else 'archived',
                  'ch': sorted(fp(x) for x in live_chars(p)),
                  'chw': sorted(fp(x) for x in toks(' '.join(live_chars(p)))),
                  't': sorted(fp(x) for x in toks(p.get('t'))), 'c': sorted(fp(x) for x in toks(p.get('c'))),
                  'line': line_from_live(p.get('o')), 'ed': edition(p.get('e'))} for p in keep],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), separators=(',', ':'))
    print({k: v for k, v in out.items() if k != 'pins'})

if __name__ == '__main__':
    main(*sys.argv[1:])
