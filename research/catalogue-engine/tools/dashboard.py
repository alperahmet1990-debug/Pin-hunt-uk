"""Catalogue dashboard + coverage map, generated only from engine outputs (never estimated by hand).

Usage (from research/catalogue-engine):
  PYTHONPATH=. python3 tools/dashboard.py out/consolidated/staging_payload.json metrics/throughput.json \
      ../../docs/research/catalogue-sprint

Writes DASHBOARD.md, COVERAGE.md and coverage.csv. "Directly verified" counts only human_direct_check,
physical_pin or an official page_fetch; search snippets never count.
"""
import json
import pathlib
import sys
import collections as C

from engine.sources import registrable, domain_of, is_fan_database

LINES = {"dlp": "Disneyland Paris", "dsuk": "Disney Store UK", "wdw": "Walt Disney World", "dlr": "Disneyland Resort"}
DIRECT = ("human_direct_check", "physical_pin")
MILESTONES = (1000, 5000, 10000)
WINDOW = {"dlp": (2024, 2026), "dsuk": (2024, 2026), "wdw": (2023, 2026), "dlr": (2023, 2026)}


def line_of(key):
    head = key.split("/")[0]
    return head if head in LINES else "earlier"


def is_direct(e):
    return e["method"] in DIRECT or (e["method"] == "page_fetch" and e["source_class"] == "official")


def independent_publishers(c):
    return {registrable(domain_of(e["source_url"])) for e in c["evidence"]
            if e["source_url"] and e["method"] == "search_snippet" and not is_fan_database(e["source_url"])}


def month_of(s):
    s = str(s or "")
    return s[:7] if len(s) >= 7 and s[4] == "-" else (s[:4] if len(s) >= 4 and s[:4].isdigit() else "")


def coverage(cands, as_of="2026-10"):
    """Per line and month: sets, named pins, set completeness, and months with no recorded release."""
    sets = {c["research_key"]: c for c in cands if c["entity_type"] == "set"}
    pins_by_set = C.Counter(c["set_research_key"] for c in cands if c["entity_type"] == "pin")
    rows = C.defaultdict(lambda: C.Counter())
    for k, s in sets.items():
        line = line_of(k)
        if line == "earlier":
            continue
        pr = s["proposed"]
        parent = sets.get(k.rsplit("/", 1)[0], {}).get("proposed", {}) if k.count("/") > 2 else {}
        m = month_of(pr.get("release_date") or parent.get("release_date")) or (k.split("/")[1] + "-??")
        r = rows[(line, m)]
        r["sets"] += 1
        found = pins_by_set.get(k, 0)
        r["pins"] += found
        exp = pr.get("expected_pin_count")
        if isinstance(exp, (int, float)) and exp > 0:
            r["counted"] += 1
            r["complete"] += found >= exp
            r["missing_pins"] += max(0, int(exp) - found)
        elif found == 0:
            r["no_pins"] += 1
    gaps = {}
    for line, (y0, y1) in WINDOW.items():
        months = [f"{y}-{m:02d}" for y in range(y0, y1 + 1) for m in range(1, 13) if f"{y}-{m:02d}" <= as_of]
        gaps[line] = [m for m in months if rows[(line, m)]["sets"] == 0]
    return rows, gaps


def build(payload, throughput):
    cands = payload["candidates"]
    pins = [c for c in cands if c["entity_type"] == "pin"]
    sets = [c for c in cands if c["entity_type"] == "set"]
    m = C.Counter()
    by_line = C.defaultdict(C.Counter)
    for c in pins:
        t = by_line[line_of(c["research_key"])]
        t["pins"] += 1
        t[c["record_confidence"]] += 1
        direct = any(is_direct(e) for e in c["evidence"])
        t["direct"] += direct
        t["approved"] += c.get("status") == "approved" and direct
        pubs = independent_publishers(c)
        t["2pub"] += len(pubs) >= 2
        cls = {e["source_class"] for e in c["evidence"] if e["method"] == "search_snippet"}
        t["official"] += "official" in cls
        t["news_only"] += "news" in cls and "official" not in cls
        t["fan_only"] += not cls & {"official", "news"}
        t["conflict"] += any(r.startswith("conflict:") for r in c["review_reasons"])
        t["dup_flag"] += any("duplicate of" in r or r.startswith("probable duplicate") for r in c["review_reasons"])
        t["dup_catalogue"] += not c["duplicate_status"].startswith("NEW")
        t["variants"] += bool(c["warnings"])
    for t in by_line.values():
        m.update(t)
    m["sets"] = len(sets)
    m["unique_est"] = m["pins"] - m["dup_catalogue"] - m["dup_flag"]
    return m, by_line


def bar(n, target, width=20):
    filled = min(width, round(width * n / target)) if target else 0
    return "█" * filled + "░" * (width - filled) + f" {n:,}/{target:,} ({100 * n / target:.1f}%)"


def render(payload, throughput, out_dir):
    out = pathlib.Path(out_dir)
    m, by_line = build(payload, throughput)
    rows, gaps = coverage(payload["candidates"], throughput.get("as_of_month", "2026-10"))
    order = ["dlp", "dsuk", "wdw", "dlr", "earlier"]
    name = dict(LINES, earlier="Earlier POC + pilot")
    L = []
    L.append("# PinHunt independent catalogue: dashboard\n")
    L.append(f"_Generated from engine output `{throughput.get('payload', 'out/consolidated/staging_payload.json')}` "
             f"(run {payload.get('git_commit', '?')}, {payload.get('generated', '?')}). Do not edit by hand: run `tools/dashboard.py`._\n")
    L.append("## Headline\n")
    L.append("| Measure | Value |\n|---|---|")
    L.append(f"| Candidate pins | **{m['pins']:,}** |")
    L.append(f"| Unique candidate pins (excl. catalogue duplicates and flagged repeats) | ≈ {m['unique_est']:,} |")
    L.append(f"| Sets / releases | {m['sets']:,} |")
    L.append(f"| **Directly verified pins** (a person or a physical pin; snippets never count) | **{m['direct']:,}** |")
    L.append(f"| **Publication-ready** (directly verified and approved) | **{m['approved']:,}** |")
    L.append(f"| Identity confidence High / Medium / Low / Unverified | {m['High']} / {m['Medium']} / {m['Low']} / {m['Unverified']} |")
    L.append(f"| 2+ independent publishers (fan databases and repeats excluded) | {m['2pub']:,} |")
    L.append(f"| Any official source / news but no official / fan only | {m['official']} / {m['news_only']} / {m['fan_only']} |")
    L.append(f"| Blocking contradictions / flagged possible duplicates / catalogue duplicates | {m['conflict']} / {m['dup_flag']} / {m['dup_catalogue']} |")
    L.append(f"| Pins with variant values (need a per-pin note) | {m['variants']} |\n")
    L.append("## Progress towards an independent catalogue\n")
    L.append("Two bars per milestone: research candidates, and **directly verified** pins (the number that counts).\n")
    L.append("```")
    for target in MILESTONES:
        L.append(f"{target:>6,}  candidates {bar(m['pins'], target)}")
        L.append(f"{'':>6}  verified   {bar(m['direct'], target)}")
    L.append("```\n")
    L.append("## By line\n")
    L.append("| Line | Pins | High | Med | Low | 2+ pubs | Official | Directly verified | Conflicts | Dup flags |\n|---|---|---|---|---|---|---|---|---|---|")
    for k in order:
        t = by_line.get(k)
        if t:
            L.append(f"| {name[k]} | {t['pins']} | {t['High']} | {t['Medium']} | {t['Low']} | {t['2pub']} | {t['official']} | {t['direct']} | {t['conflict']} | {t['dup_flag']} |")
    L.append("")
    v = throughput.get("verification", {})
    L.append("## Verification effort (from the worklist)\n")
    L.append(f"- Pages to open to cover named pins: **{v.get('pages', '?')}** ({v.get('official_pages', '?')} official, covering {v.get('official_pins', '?')} pins).")
    L.append(f"- At about {v.get('minutes_per_page', 2)} min per page with set-level review: **≈ {round(v.get('pages', 0) * v.get('minutes_per_page', 2) / 60, 1)} h** for everything; "
             f"the DSUK High pilot ({v.get('pilot_pins', '?')} pins, {v.get('pilot_pages', '?')} pages) ≈ {v.get('pilot_pages', 0) * v.get('minutes_per_page', 2)} min.")
    L.append("- Per-pin review without set-level checks: about 1–2 min per pin.\n")
    L.append("## Research throughput\n")
    L.append("| Pass | Date | Searches | New named pins | Pins gaining an independent 2nd source |\n|---|---|---|---|---|")
    for p in throughput.get("passes", []):
        L.append(f"| {p['name']} | {p['date']} | {p['searches']} | {p.get('new_pins', 0)} | {p.get('corroborated', 0)} |")
    tot_s = sum(p["searches"] for p in throughput.get("passes", []))
    tot_n = sum(p.get("new_pins", 0) for p in throughput.get("passes", []))
    L.append(f"\nTotal: {tot_s} searches, {tot_n} named pins found by search (≈ {tot_n / max(tot_s, 1):.1f} per search). "
             "Search-based gains are now small; verification, not search volume, is the constraint.\n")
    if throughput.get("accuracy"):
        a = throughput["accuracy"]
        L.append("## Measured accuracy of candidates (blind audit)\n")
        L.append(a.get("summary", "") + "\n")
    L.append("See `COVERAGE.md` for the release coverage map.\n")
    (out / "DASHBOARD.md").write_text("\n".join(L))

    C2 = ["# Catalogue coverage map\n",
          "_Generated by `tools/dashboard.py`. Months use the set's release date; `-??` means the year is known but not the month._\n",
          "Legend: sets / named pins · counted sets complete · missing pins in counted sets · sets with no pins and no stated count.\n"]
    csv = ["line,month,sets,pins,counted_sets,complete_sets,missing_pins,sets_no_pins"]
    for line in ["dlp", "dsuk", "wdw", "dlr"]:
        C2.append(f"## {LINES[line]}\n")
        C2.append("| Month | Sets | Pins | Counted complete | Missing pins | No pins, no count |\n|---|---|---|---|---|---|")
        for (ln, mon), r in sorted(rows.items()):
            if ln != line:
                continue
            C2.append(f"| {mon} | {r['sets']} | {r['pins']} | {r['complete']}/{r['counted']} | {r['missing_pins']} | {r['no_pins']} |")
            csv.append(f"{ln},{mon},{r['sets']},{r['pins']},{r['counted']},{r['complete']},{r['missing_pins']},{r['no_pins']}")
        g = gaps.get(line, [])
        C2.append(f"\n**Months with no recorded release ({len(g)}):** {', '.join(g) if g else 'none'}\n")
    (out / "COVERAGE.md").write_text("\n".join(C2))
    (out / "coverage.csv").write_text("\n".join(csv) + "\n")
    return m, by_line, rows, gaps


if __name__ == "__main__":
    payload = json.load(open(sys.argv[1]))
    throughput = json.load(open(sys.argv[2]))
    m, *_ = render(payload, throughput, sys.argv[3])
    print({k: m[k] for k in ("pins", "unique_est", "sets", "direct", "approved", "High", "Medium", "Low", "2pub", "conflict", "dup_flag")})
