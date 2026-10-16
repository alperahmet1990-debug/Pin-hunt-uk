"""Historical backfill report (2015–2026): coverage, dedupe status and the consolidated workbook.

Usage: python3 tools/backfill_report.py <engine staging_payload.json> <out.xlsx> [coverage.json]
Duplicate checks use the committed fingerprint baseline (tools/live_match.py). If it is missing or stale
the report stops with exit code 3 (DUPLICATE CHECK PAUSED) instead of skipping duplicate checks.
Live public counts come from the baseline's aggregate rows; no readable live data is written.
"""
import json, os, re, sys, collections
from urllib.parse import urlparse
sys.path.insert(0, os.path.dirname(__file__))
import live_match as M
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

YEARS = list(range(2015, 2027))
RULED = ('disneypinventory', 'disneypinforum', 'fandom', 'threads.com', 'x.com', 'reddit', 'facebook', 'instagram')
LINES = ['WDW', 'Disneyland California', 'Disneyland Paris', 'Disney Store', 'Shanghai', 'Hong Kong', 'Tokyo',
         'Licensed retailers', 'Multi-park / shared', 'Other']

def line_from_key(k):
    p = k.split('/')[0]
    return {'wdw': 'WDW', 'dlr': 'Disneyland California', 'dlp': 'Disneyland Paris', 'dsuk': 'Disney Store', 'dsus': 'Disney Store',
            'shdr': 'Shanghai', 'hkdl': 'Hong Kong', 'tdr': 'Tokyo', 'lic': 'Licensed retailers',
            'brush-of-magic': 'Disney Store', 'animated-cuties': 'Disney Store', 'disney-classics-london': 'Disney Store'}.get(p, 'Other')

BRANDS = [('loungefly', 'Loungefly'), ('boxlunch', 'BoxLunch'), ('hot-topic', 'Hot Topic'), ('artland', 'ArtLand'),
          ('pink-a-la-mode', 'Pink a la Mode'), ('funko', 'Funko'), ('her-universe', 'Her Universe')]

def brands_of(key):
    """Licensed makers/retailers named in a lic/ key's release slug. A Loungefly pin sold at BoxLunch counts for both."""
    parts = key.split('/')
    if parts[0] != 'lic' or len(parts) < 3: return []
    slug = '-' + parts[2] + '-'
    found = [name for s, name in BRANDS if '-' + s + '-' in slug]
    return found or ['Other licensed']

def line_from_live(o):
    o = (o or '').lower()
    if 'walt disney world' in o: return 'WDW'
    if 'disneyland resort /' in o or 'california adventure' in o: return 'Disneyland California'
    if 'paris' in o: return 'Disneyland Paris'
    if 'shanghai' in o: return 'Shanghai'
    if 'hong kong' in o: return 'Hong Kong'
    if 'tokyo' in o or 'japan' in o: return 'Tokyo'
    if 'store' in o or 'shopping' in o: return 'Disney Store'
    if any(x in o for x in ('loungefly', 'box lunch', 'boxlunch', 'hot topic', 'acme', 'hotart', 'pink a la mode', 'artland')): return 'Licensed retailers'
    if o == 'shared': return 'Multi-park / shared'
    return 'Other'

def edition(e):
    e = (e or '').lower()
    if e.startswith('open'): return 'OE'
    if 'limited edition' in e or e == 'le': return 'LE'
    if 'limited release' in e or e == 'lr': return 'LR'
    return 'Other / not stated'

def year_of(pr, key=None):
    y = pr.get('Release year') or str(pr.get('Release date') or '')[:4]
    try: return int(y)
    except Exception:
        m = re.search(r'/(\d{4})/', (key or '') + '/')  # the research key carries the release year
        return int(m.group(1)) if m else None

def norm(s): return ' '.join(re.findall(r'[a-z0-9]+', str(s or '').lower()))

def main(payload, out_xlsx, cov_json=None):
    ok, msg = M.baseline_status()
    if not ok:
        print('DUPLICATE CHECK PAUSED: ' + msg); sys.exit(3)
    print('live baseline: ' + msg)
    d = json.load(open(payload))
    pins = [c for c in d['candidates'] if c['entity_type'] == 'pin']
    live = [p for p in M.live if p['_k'] == 'public']
    # Shared releases: the same pin recorded under two resorts counts once; later records are held.
    seen_shared = {}
    rows = []
    for c in pins:
        pr = c['proposed']; y = year_of(pr, c['research_key'])
        usable = [e for e in c['evidence'] if e.get('source_url') and not any(r in e['source_url'] for r in RULED)]
        pubs = {urlparse(e['source_url']).hostname.replace('www.', '') for e in usable}
        m = M.match(c)
        rr = c['review_reasons']
        if m and m[2] == 'public': status = 'held: possible live match'  # never dropped silently; a person decides
        elif m: status = 'held: archived match'
        elif any(r.startswith(('conflict', 'possible cross', 'probable duplicate', 'possible internal')) for r in rr) or c['duplicate_status'] == 'DUPLICATE':
            status = 'held: conflict/duplicate'
        elif not usable: status = 'no usable source'
        else: status = 'new'
        sig = (norm(pr.get('Pin name')), norm(pr.get('Characters')), str(pr.get('Release date') or y))
        if status == 'new' and pr.get('Pin name'):
            first = seen_shared.setdefault(sig, c['research_key'])
            if first != c['research_key'] and first.split('/')[0] != c['research_key'].split('/')[0]:
                status = 'held: same pin under another resort'
        rows.append(dict(key=c['research_key'], line=line_from_key(c['research_key']), year=y, ed=edition(pr.get('Edition type')),
                         standalone=('/oe-single/' in (c.get('set_research_key') or '')), status=status,
                         corroborated=len(pubs) >= 2, conf=c['record_confidence'], name=pr.get('Pin name'),
                         chars=pr.get('Characters'), set=c.get('set_research_key'), match=(m[1] if m else '')))
    livec = collections.Counter((p.get('line') or line_from_live(p.get('o')), p['y'], p.get('ed') or edition(p.get('e'))) for p in live)
    newc = collections.Counter((r['line'], r['year'], r['ed']) for r in rows if r['status'] == 'new')
    stat = collections.Counter(r['status'] for r in rows)
    wb = Workbook(); ws = wb.active; ws.title = 'Summary'
    hdr = Font(bold=True); fill = PatternFill('solid', fgColor='E9E7F3')
    def table(ws, header, data):
        ws.append(header)
        for cell in ws[ws.max_row]: cell.font = hdr; cell.fill = fill
        for r in data: ws.append(r)
    in_range = lambda y: y is not None and 2015 <= y <= 2026
    live_n = sum(v for (l, y, e), v in livec.items() if in_range(y))
    new_n = sum(1 for r in rows if r['status'] == 'new' and in_range(r['year']))
    table(ws, ['Measure', 'Count', 'Note'], [
        ['Live public catalogue pins, 2015–2026', live_n, 'Collectible PinTrader (aggregated from the live export)'],
        ['Research candidates (all)', len(rows), 'every identified pin has its own record'],
        ['Genuinely new research pins', new_n, 'not live, not held'],
        ['Corroborated new pins (2+ independent publishers)', sum(1 for r in rows if r['status'] == 'new' and r['corroborated']), ''],
        ['Held: possible live match', stat['held: possible live match'], 'matches a public live pin; a person decides'],
        ['Held: archived match', stat['held: archived match'], 'decision needed'],
        ['Held: conflict / duplicate', stat['held: conflict/duplicate'], 'conflicts preserved'],
        ['Held: same pin under another resort', stat['held: same pin under another resort'], 'shared WDW/DLR releases counted once'],
        ['No usable source', stat['no usable source'], 'lead-only evidence'],
        ['Total unique pins identified (live + new)', live_n + new_n, 'excludes held and duplicates'],
    ])
    for col, w in zip('ABC', (48, 12, 60)): ws.column_dimensions[col].width = w
    ws2 = wb.create_sheet('By year x line')
    table(ws2, ['Line'] + [str(y) for y in YEARS] + ['Total'],
          [[l] + [sum(livec[(l, y, e)] + newc[(l, y, e)] for e in ('OE', 'LE', 'LR', 'Other / not stated')) for y in YEARS]
           + [sum(livec[(l, y, e)] + newc[(l, y, e)] for y in YEARS for e in ('OE', 'LE', 'LR', 'Other / not stated'))] for l in LINES])
    ws3 = wb.create_sheet('Year x line x edition')
    data = []
    for l in LINES:
        for y in YEARS:
            for e in ('OE', 'LE', 'LR', 'Other / not stated'):
                lv, nw = livec[(l, y, e)], newc[(l, y, e)]
                if lv or nw: data.append([y, l, e, lv, nw, lv + nw])
    table(ws3, ['Year', 'Line', 'Edition', 'Live', 'New research', 'Total unique'], data)
    ws4 = wb.create_sheet('Research pins')
    table(ws4, ['research_key', 'line', 'year', 'edition', 'standalone OE', 'status', 'corroborated', 'confidence', 'pin name', 'characters', 'set', 'live/archived match'],
          [[r['key'], r['line'], r['year'], r['ed'], r['standalone'], r['status'], r['corroborated'], r['conf'], r['name'], r['chars'], r['set'], r['match']] for r in rows])
    sets = collections.defaultdict(list)
    for c in pins: sets[c.get('set_research_key')].append(c)
    ws5 = wb.create_sheet('Sets')
    srows = []
    for k, v in sets.items():
        exp = v[0]['proposed'].get('Expected pin count')
        if len(v) < 2 and not exp: continue
        srows.append([k, v[0]['proposed'].get('Collection name'), line_from_key(k), year_of(v[0]['proposed']), exp, len(v),
                      (exp - len(v)) if isinstance(exp, (int, float)) and exp > len(v) else 0])
    table(ws5, ['set key', 'collection', 'line', 'year', 'expected (stated)', 'identified', 'missing (not invented)'], sorted(srows, key=lambda r: str(r[0])))
    cov = {f'{l}|{y}': dict(live=sum(livec[(l, y, e)] for e in ('OE', 'LE', 'LR', 'Other / not stated')),
                            new=sum(newc[(l, y, e)] for e in ('OE', 'LE', 'LR', 'Other / not stated'))) for l in LINES for y in YEARS}
    if cov_json: json.dump(cov, open(cov_json, 'w'), indent=0)
    # Progress block for the hourly report: year x edition, latest-round delta, sets, standalone OE.
    state_path = os.path.join(os.path.dirname(os.path.abspath(out_xlsx)), 'report_state.json')
    try: prev = json.load(open(state_path))
    except Exception: prev = {'new': [], 'corroborated': []}
    new_keys = sorted(r['key'] for r in rows if r['status'] == 'new' and in_range(r['year']))
    corr_keys = sorted(r['key'] for r in rows if r['status'] == 'new' and in_range(r['year']) and r['corroborated'])
    added = set(new_keys) - set(prev['new']); added_corr = added & set(corr_keys)
    eds = ('OE', 'LE', 'LR', 'Other / not stated')
    lines_out = ['YEAR  unique   OE   LE   LR other  (live+new)']
    for y in YEARS:
        per = [sum(livec[(l, y, e)] + newc[(l, y, e)] for l in LINES) for e in eds]
        lines_out.append(f'{y}  {sum(per):6d} {per[0]:4d} {per[1]:4d} {per[2]:4d} {per[3]:5d}')
    inc = [r for r in srows if r[6]]
    sa = [r for r in rows if r['status'] == 'new' and in_range(r['year']) and r['standalone']]
    oe_new = [r for r in rows if r['status'] == 'new' and in_range(r['year']) and r['ed'] == 'OE']
    lines_out += [f'Latest round: +{len(added)} genuinely new unique pins, {len(added_corr)} of them corroborated',
                  f'Incomplete sets: {len(inc)} sets, {sum(r[6] for r in inc)} named members still missing (never invented)',
                  f'Standalone OE (new research): {len(sa)} of {len(oe_new)} new OE pins; live OE 2015-2026: {sum(livec[(l, y, "OE")] for l in LINES for y in YEARS)}']
    lic = [r for r in rows if r['line'] == 'Licensed retailers' and in_range(r['year'])]
    bcount = collections.Counter((b, r['status'] == 'new') for r in lic for b in brands_of(r['key']))
    names = [n for _, n in BRANDS] + ['Other licensed']
    lines_out.append('Licensed (research, 2015-2026; Loungefly-at-BoxLunch counts for both): ' + ' | '.join(
        f'{n} {bcount[(n, True)]} new' + (f' (+{bcount[(n, False)]} held)' if bcount[(n, False)] else '') for n in names))
    ws6 = wb.create_sheet('Licensed by brand')
    table(ws6, ['Brand', *YEARS, 'New total', 'Held'], [
        [n, *[sum(1 for r in lic if r['status'] == 'new' and r['year'] == y and n in brands_of(r['key'])) for y in YEARS],
         bcount[(n, True)], bcount[(n, False)]] for n in names])
    wb.save(out_xlsx)
    print('\n'.join(lines_out))
    json.dump({'new': new_keys, 'corroborated': corr_keys}, open(state_path, 'w'))
    print(json.dumps({'live_2015_2026': live_n, 'candidates': len(rows), 'new': new_n,
                      'corroborated_new': sum(1 for r in rows if r['status'] == 'new' and r['corroborated']),
                      'possible_live_match': stat['held: possible live match'], 'held': stat['held: possible live match'] + stat['held: archived match'] + stat['held: conflict/duplicate'] + stat['held: same pin under another resort'],
                      'no_usable_source': stat['no usable source']}))

if __name__ == '__main__':
    main(*sys.argv[1:])
