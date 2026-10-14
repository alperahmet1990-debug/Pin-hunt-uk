"""DSUK High-confidence verification pilot: subset run payload + page checklist.

Usage: python3 pilot.py <staging_payload.json> <worklist.xlsx> <out_dir> <git_commit>
"""
import json, sys, pathlib, collections as C
import pandas as pd

src, worklist, out_dir, commit = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3]), sys.argv[4]
out_dir.mkdir(parents=True, exist_ok=True)
p = json.load(open(src))
cs = p["candidates"]
pins = [c for c in cs if c["entity_type"] == "pin" and c["research_key"].startswith("dsuk/") and c["record_confidence"] == "High"]
need = set()
for c in pins:
    k = c["set_research_key"]
    while k:
        need.add(k)
        k = k.rsplit("/", 1)[0] if k.count("/") > 2 else ""
sets = [c for c in cs if c["entity_type"] == "set" and c["research_key"] in need]
run = dict(p, git_commit=commit, candidates=sets + pins)
run["generated"] = p.get("generated")
(out_dir / "pilot_dsuk_high_payload.json").write_text(json.dumps(run, ensure_ascii=False, indent=1))

flag = lambda c, s: any(s in r for r in c["review_reasons"])
summary = C.Counter()
for c in pins:
    summary["pins"] += 1
    summary["blocking conflict (individual review)"] += flag(c, "conflict:")
    summary["possible duplicate flag (individual review)"] += flag(c, "duplicate")
    summary["variant warnings (note needed)"] += bool(c["warnings"])
    summary["exact catalogue duplicate"] += not c["duplicate_status"].startswith("NEW")
    summary["multi-character (confirm structure)"] += flag(c, "structure:")
summary["sets"] = len(sets)

wl = pd.read_excel(worklist, sheet_name="1 DSUK High (start here)")
wl.insert(0, "Page", range(1, len(wl) + 1))
pin_by_key = {c["research_key"]: c for c in pins}
def note(keys):
    out = []
    for k in str(keys).split(" | "):
        c = pin_by_key.get(k)
        if c is None:
            continue
        tags = []
        if flag(c, "conflict:"): tags.append("conflict")
        if flag(c, "duplicate"): tags.append("possible duplicate")
        if c["warnings"]: tags.append("variants: add a note")
        if flag(c, "structure:"): tags.append("check one pin vs separate pins")
        if tags:
            out.append(f"{k.rsplit('/', 1)[-1]}: {', '.join(tags)}")
    return "; ".join(out)
wl["Review on its own"] = wl["Pin keys"].map(note)
with pd.ExcelWriter(out_dir / "pilot_dsuk_high_checklist.xlsx") as xw:
    pd.DataFrame([{"Measure": k, "Value": v} for k, v in summary.items()]).to_excel(xw, sheet_name="Summary", index=False)
    wl.to_excel(xw, sheet_name="24 pages", index=False)
print(dict(summary), "pages", len(wl), "payload bytes", (out_dir / "pilot_dsuk_high_payload.json").stat().st_size)
