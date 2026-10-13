"""Scale benchmark: synthetic packets (no real facts) to time the offline engine.
Run: python3 bench.py 5000"""
import json, random, sys, tempfile, time, pathlib
from engine.run import run

N = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
random.seed(1)
pubs = ["https://www.disneystore.com/p", "https://wdwnt.com/a", "https://disneypinsblog.com/b", "https://www.laughingplace.com/c"]
with tempfile.TemporaryDirectory() as d:
    sets, pins = [], []
    for s in range(N // 10):
        sk = f"bench-family-{s // 4}/series-{s % 4}"
        sets.append(dict(set_key=sk, claims=[dict(field="expected_pin_count", value=10, source_url=pubs[0], method="search_snippet"),
                                             dict(field="set_name", value=f"Bench Set {s}", source_url=pubs[1], method="search_snippet")]))
        for i in range(10):
            cl = []
            for u in random.sample(pubs, random.randint(1, 4)):
                cl += [dict(field="characters", value=[f"Char{i}"], source_url=u, method="search_snippet"),
                       dict(field="release_date", value=f"2026-{1 + s % 12:02d}-0{1 + i % 9}", source_url=u, method="search_snippet"),
                       dict(field="edition_size", value=random.choice([2500, 2500, 3750]), source_url=u, method="search_snippet")]
            pins.append(dict(pin_key=f"{sk}/char{i}", set_key=sk, claims=cl))
    pathlib.Path(d, "bench.json").write_text(json.dumps(dict(packet_id="bench", sets=sets, pins=pins)))
    t = time.time()
    store, P, S, D, rows = run([f"{d}/bench.json"], f"{d}/out", seed=None)
    print(f"{len(P)} pins, {len(store.claims)} claims → {time.time() - t:.1f}s end-to-end (incl. Excel)")
