"""Duplicate matcher: research candidates vs the live catalogue.

Default source: the committed, versioned fingerprint baseline (baseline/live_catalogue_fingerprint.json).
Set LIVE_PINS=<raw export json> only to cross-check against a raw export kept outside the repo.
If the baseline is missing, unreadable or older than its max_age_days, matching is PAUSED: callers
must check `baseline_status()` and stop rather than skip duplicate checks.
"""
import json, re, os, collections, hashlib, datetime
STOP = set('the and pin pins disney parks park store mystery series collection limited edition release set box blind pack open of a with in on at for to le lr oe mini booster starter walt world disneyland resort wdw dlr 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025 2026 pc piece'.split())
BASELINE = os.path.join(os.path.dirname(__file__), '..', 'baseline', 'live_catalogue_fingerprint.json')

def toks(s): return {w for w in re.findall(r"[a-z0-9]+", str(s or '').lower()) if w not in STOP and len(w) > 1}
def chars(s): return {c.strip().lower() for c in re.split(r"[;,/&]| and ", str(s or '')) if c.strip() and c.strip().lower() not in ('unknown', 'various', 'null')}
def fp(x): return hashlib.sha256(str(x).encode('utf-8')).hexdigest()[:12]

MODE, META, live, STATUS = None, {}, [], (False, 'not loaded')
_raw = os.environ.get('LIVE_PINS')
if _raw:
    MODE = 'raw'
    live = json.load(open(_raw))
    for p in live:
        p['_ch'] = chars(p.get('a')) | chars(p.get('m')); p['_chw'] = toks(' '.join(p['_ch']))
        p['_t'] = toks(p.get('t')); p['_c'] = toks(p.get('c')); p['_k'] = 'public' if p.get('v') else 'archived'
    live = [p for p in live if p.get('e') != 'Seed']
    STATUS = (True, f'raw export {_raw} ({len(live)} non-seed rows)')
else:
    MODE = 'baseline'
    try:
        META = json.load(open(BASELINE))
        age = (datetime.date.today() - datetime.date.fromisoformat(META['exported_at'])).days
        for p in META['pins']:
            live.append(dict(id=p['id'], y=p['y'], _k=p['k'], _ch=set(p['ch']), _chw=set(p['chw']), _t=set(p['t']), _c=set(p['c']), t='', c='',
                             line=p.get('line'), ed=p.get('ed')))
        if age > META.get('max_age_days', 14):
            STATUS = (False, f"baseline {META['version']} is {age} days old (max {META.get('max_age_days', 14)}): refresh it")
        else:
            STATUS = (True, f"baseline {META['version']} ({META['rows_indexed']} rows indexed of {META['rows_total']}, {age} days old)")
    except FileNotFoundError:
        STATUS = (False, 'baseline file missing')
    except Exception as e:
        STATUS = (False, f'baseline unreadable: {e}')

def baseline_status(): return STATUS
H = (lambda s: set(s)) if MODE == 'raw' else (lambda s: {fp(x) for x in s})

idx = collections.defaultdict(list)
for p in live: idx[p['y']].append(p)

def match(c):
    """Best live match for a research candidate, or None. Raises if the baseline is unavailable."""
    if not STATUS[0]: raise RuntimeError('DUPLICATE CHECK PAUSED: ' + STATUS[1])
    pr = c['proposed']; y = pr.get('Release year') or (str(pr.get('Release date') or '')[:4])
    try: y = int(y)
    except Exception: return None
    ch_raw = chars(pr.get('Characters')) | chars(pr.get('Main character')); chtok_raw = toks(' '.join(ch_raw))
    ch, chtok = H(ch_raw), H(chtok_raw)
    ct = H(toks(pr.get('Pin name')) - chtok_raw); cc = H(toks(pr.get('Collection name')) - chtok_raw)
    best = None
    for p in idx.get(y, []):
        if not (ch & p['_ch'] or chtok & p['_chw']): continue
        pt = p['_t'] - p['_chw']; pc = p['_c'] - p['_chw']
        tj = len(ct & pt) / max(1, len(ct | pt)) if ct and pt else 0
        cj = len(cc & pc) / max(1, min(len(cc), len(pc))) if cc and pc else 0
        # collection words or distinctive title words must agree, not just the character
        if (cj >= 0.6 and len(cc & pc) >= 2) or (tj >= 0.5 and len(ct & pt) >= 1) or (cj >= 0.6 and tj >= 0.34):
            score = tj + cj
            if best is None or score > best[0]: best = (score, p['id'], p['_k'], p.get('t', ''), p.get('c', ''))
    return best
