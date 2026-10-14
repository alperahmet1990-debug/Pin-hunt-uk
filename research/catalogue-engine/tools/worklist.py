"""Verification worklist: one row per (set, source page) — open the page once, tick every pin it shows.

Usage: python3 worklist.py <staging_payload.json> <out.xlsx>
Facts only; no images or copied text. Every row is a CANDIDATE until a person checks it.
"""
import json, sys, collections as C
import pandas as pd
from engine.sources import registrable, domain_of, is_fan_database, classify

RANK = {"official": 0, "news": 1, "fan": 2, "unclassified": 3}
payload, out = sys.argv[1], sys.argv[2]
cs = json.load(open(payload))["candidates"]
sets = {c["research_key"]: c for c in cs if c["entity_type"] == "set"}
pins = [c for c in cs if c["entity_type"] == "pin"]
line_of = lambda k: k.split("/")[0] if k.split("/")[0] in ("dlp", "dsuk", "wdw", "dlr") else "earlier"
LINE = {"dlp": "Disneyland Paris", "dsuk": "Disney Store UK", "wdw": "Walt Disney World", "dlr": "Disneyland Resort", "earlier": "Earlier POC/pilot"}

# For each set, which source URLs name which of its pins (identity claims only).
by_set = C.defaultdict(lambda: C.defaultdict(set))
for p in pins:
    for e in p["evidence"]:
        if e["field"] in ("characters", "pin_name", "main_character", "attraction") and e["source_url"] and e["method"] == "search_snippet":
            by_set[p["set_research_key"]][e["source_url"]].add(p["research_key"])

rows, covered = [], set()
pin_by_key = {p["research_key"]: p for p in pins}
for sk, urls in by_set.items():
    remaining = {k for u in urls.values() for k in u}
    # Greedy: fewest pages that cover the set, best source class first.
    while remaining:
        url = min(urls, key=lambda u: (RANK.get(classify(u), 9) + (3 if is_fan_database(u) else 0), -len(urls[u] & remaining)))
        got = urls[url] & remaining
        if not got:
            break
        remaining -= got
        ps = [pin_by_key[k] for k in sorted(got)]
        conf = C.Counter(p["record_confidence"] for p in ps)
        s = sets.get(sk, {}).get("proposed", {}) or sets.get(sk.rsplit("/", 1)[0], {}).get("proposed", {})
        cls = "fan database" if is_fan_database(url) else classify(url)
        rows.append({
            "Line": LINE[line_of(sk)], "Set key": sk,
            "Set": s.get("set_name") or sk,
            "Release date": s.get("release_date", ""),
            "Pins on this page": len(ps), "High": conf["High"], "Medium": conf["Medium"], "Low": conf["Low"] + conf["Unverified"],
            "Blocking conflicts": sum(any(r.startswith("conflict:") for r in p["review_reasons"]) for p in ps),
            "Source class": cls, "Open this page (human check)": url,
            "Pins to tick (candidate names)": " | ".join(
                f"{p['proposed'].get('Pin name') or p['proposed'].get('Characters') or p['research_key'].rsplit('/', 1)[-1]}" for p in ps),
            "Pin keys": " | ".join(p["research_key"] for p in ps),
            "Checked by": "", "Date checked": "", "Pins confirmed": "", "Notes": "",
        })
        covered |= got

df = pd.DataFrame(rows)
df["_o"] = df["Source class"].map(lambda c: RANK.get(c, 5))
df = df.sort_values(["_o", "Pins on this page", "High"], ascending=[True, False, False]).drop(columns="_o")
df.insert(0, "Priority", range(1, len(df) + 1))
dsuk_high = df[(df["Line"] == "Disney Store UK") & (df["High"] > 0)]
summary = pd.DataFrame([
    {"Measure": "Candidate pins", "Value": len(pins)},
    {"Measure": "Pins reachable from a cited page", "Value": len(covered)},
    {"Measure": "Pages to open (all)", "Value": len(df)},
    {"Measure": "Pages to open, official only", "Value": int((df["Source class"] == "official").sum())},
    {"Measure": "Pins on official pages", "Value": int(df.loc[df["Source class"] == "official", "Pins on this page"].sum())},
    {"Measure": "DSUK High-confidence pins", "Value": int(sum(1 for p in pins if line_of(p["research_key"]) == "dsuk" and p["record_confidence"] == "High"))},
    {"Measure": "Pages covering DSUK High pins", "Value": len(dsuk_high)},
    {"Measure": "Status of every row", "Value": "CANDIDATE: not verified until a person opens the page and ticks the pin"},
])
with pd.ExcelWriter(out) as xw:
    summary.to_excel(xw, sheet_name="Summary", index=False)
    dsuk_high.to_excel(xw, sheet_name="1 DSUK High (start here)", index=False)
    df.to_excel(xw, sheet_name="All pages", index=False)
for _, r in summary.iterrows():
    print(r["Measure"], "=", r["Value"])
print("pages by class", df["Source class"].value_counts().to_dict())
print("pins by class", df.groupby("Source class")["Pins on this page"].sum().to_dict())
print("pins per page DSUK high", dsuk_high["Pins on this page"].describe()[["mean", "max"]].to_dict(), int(dsuk_high["High"].sum()))
