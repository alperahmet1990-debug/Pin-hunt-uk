import json, collections as C, sys
from urllib.parse import urlparse
from engine.sources import registrable, domain_of, is_fan_database

payload, outdir = sys.argv[1], sys.argv[2]
cs = json.load(open(payload))["candidates"]
sets = {c["research_key"]: c for c in cs if c["entity_type"] == "set"}
out = C.defaultdict(list)
for c in cs:
    if c["entity_type"] != "pin":
        continue
    line = c["research_key"].split("/")[0]
    if line not in ("dlp", "dsuk", "wdw", "dlr"):
        continue
    pubs = {registrable(domain_of(e["source_url"])) for e in c["evidence"] if e["source_url"] and e["method"] == "search_snippet" and not is_fan_database(e["source_url"])}
    if len(pubs) >= 2:
        continue
    s = sets.get(c["set_research_key"], {}).get("proposed", {})
    pr = c["proposed"]
    out[line].append(f"{c['research_key']} | set: {s.get('set_name') or c['set_research_key']} | "
                     f"pin: {pr.get('Pin name', '')} / {pr.get('Characters', '')} | date {pr.get('Release date', '')} | "
                     f"current publisher: {', '.join(sorted(pubs))}")
for k, v in out.items():
    if k == "dlp":
        half = (len(v) + 1) // 2
        open(f"{outdir}/single_dlp_a.txt", "w").write("\n".join(v[:half]))
        open(f"{outdir}/single_dlp_b.txt", "w").write("\n".join(v[half:]))
    else:
        open(f"{outdir}/single_{k}.txt", "w").write("\n".join(v))
    print(k, len(v))
