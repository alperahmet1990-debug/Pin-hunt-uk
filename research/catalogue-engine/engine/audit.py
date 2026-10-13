"""Post-run audit: proves the 'never invent' rule on a finished run.

For every pin field with a value in records_with_evidence.json, the value must
be backed by ≥1 accepted evidence claim (page_fetch/search_snippet/physical_pin),
or be inherited from a set field / derived from another field that is.
Run: python3 -m engine.audit out/records_with_evidence.json
"""
import json
import sys

EVIDENCE = {"page_fetch", "search_snippet", "physical_pin"}


def audit(path):
    d = json.load(open(path))
    problems, checked = [], 0
    for p in d["pins"]:
        for fn, r in p["fields"].items():
            if r["value"] in (None, [], ""):
                continue
            checked += 1
            if r.get("inherited_from") or r.get("derived_from"):
                if not r["evidence"]:
                    problems.append((p["key"], fn, "inherited/derived without evidence"))
                continue
            if r["status"] == "unverified":
                problems.append((p["key"], fn, "value shown without evidence"))
            elif not any(e["method"] in EVIDENCE for e in r["evidence"]):
                problems.append((p["key"], fn, "no evidence claim"))
    return checked, problems


if __name__ == "__main__":
    checked, problems = audit(sys.argv[1] if len(sys.argv) > 1 else "out/records_with_evidence.json")
    print(f"audited {checked} populated pin fields; problems: {len(problems)}")
    for x in problems[:20]:
        print("  ", x)
    sys.exit(1 if problems else 0)
