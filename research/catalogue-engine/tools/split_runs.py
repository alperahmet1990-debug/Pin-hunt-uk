"""Split an engine staging payload into research runs the Research Review API accepts.

Usage: python3 tools/split_runs.py <staging_payload.json> <out_dir>

Limits mirror artifacts/api-server (research-run.ts / research-review.ts): at most 2,000 candidates,
50,000 evidence rows and 5 MB per uploaded run. Each set travels with all of its pins and sub-sets,
so a run never splits a set. Runs are filled in line/year order and named after what they hold.
Nothing here talks to Supabase; loading a run into staging is a separate, approved step.
"""
import json, os, sys, collections

MAX_CANDIDATES, MAX_EVIDENCE, MAX_BYTES = 1900, 45000, int(4.6 * 1024 * 1024)  # margins under 2000 / 50000 / 5 MB
LINE_ORDER = ['wdw', 'dlr', 'dlp', 'dsuk', 'dsus', 'shdr', 'hkdl', 'tdr', 'lic']


def size(c):
    return len(json.dumps(c, separators=(',', ':'), ensure_ascii=False).encode()) + 1


def groups(cands):
    """Candidates grouped by the root set they belong to (a set's parent chain is followed)."""
    by_key = {c['research_key']: c for c in cands}
    def root(key, seen=()):
        c = by_key.get(key)
        parent = c and c.get('set_research_key')
        return root(parent, seen + (key,)) if parent and parent in by_key and parent not in seen else key
    g = collections.OrderedDict()
    for c in cands:
        k = c['research_key'] if c['entity_type'] == 'set' else (c.get('set_research_key') or c['research_key'])
        g.setdefault(root(k), []).append(c)
    def order(k):
        line, year = (k.split('/') + ['', ''])[:2]
        return (LINE_ORDER.index(line) if line in LINE_ORDER else len(LINE_ORDER), year, k)
    return [g[k] for k in sorted(g, key=order)]


def main(src, out_dir):
    d = json.load(open(src))
    head = {k: v for k, v in d.items() if k != 'candidates'}
    runs, cur = [], []
    def flush():
        if cur: runs.append(list(cur)); cur.clear()
    for grp in groups(d['candidates']):
        n, ev, b = len(grp), sum(len(c.get('evidence', [])) for c in grp), sum(size(c) for c in grp)
        if n > MAX_CANDIDATES or ev > MAX_EVIDENCE or b > MAX_BYTES:
            sys.exit(f"set {grp[0]['research_key']} alone exceeds a run's limits; split it by hand")
        if cur and (len(cur) + n > MAX_CANDIDATES or sum(len(c.get('evidence', [])) for c in cur) + ev > MAX_EVIDENCE
                    or sum(size(c) for c in cur) + b > MAX_BYTES):
            flush()
        cur.extend(grp)
    flush()
    os.makedirs(out_dir, exist_ok=True)
    index = []
    for i, run in enumerate(runs, 1):
        lines = sorted({c['research_key'].split('/')[0] for c in run}, key=lambda l: (LINE_ORDER.index(l) if l in LINE_ORDER else 99, l))
        name = f"run_{i:02d}_{lines[0]}" + (f"-to-{lines[-1]}" if len(lines) > 1 else '') + '.json'
        body = dict(head, candidates=run)
        with open(os.path.join(out_dir, name), 'w') as f:
            json.dump(body, f, separators=(',', ':'), ensure_ascii=False)
        st = collections.Counter(c['entity_type'] for c in run)
        index.append(dict(file=name, pins=st['pin'], sets=st['set'], evidence=sum(len(c.get('evidence', [])) for c in run),
                          bytes=os.path.getsize(os.path.join(out_dir, name)), lines=lines))
    json.dump(dict(source=os.path.basename(src), git_commit=head.get('git_commit'), generated=head.get('generated'), runs=index),
              open(os.path.join(out_dir, 'index.json'), 'w'), indent=1)
    for r in index:
        print(f"{r['file']}: {r['pins']} pins, {r['sets']} sets, {r['evidence']} evidence, {r['bytes'] / 1048576:.2f} MB")


if __name__ == '__main__':
    main(*sys.argv[1:3])
