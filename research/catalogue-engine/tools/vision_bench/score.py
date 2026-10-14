"""Score vision extractions against poster ground truth, and two extractions against each other.

Usage: python3 score.py <truth_dir> <extract_A.json> [<extract_B.json>]
Pins are matched by position; a field is correct only when it equals the truth exactly
(subject compared case- and accent-insensitively).
"""
import json, pathlib, sys, unicodedata

FIELDS = ("subject", "edition_type", "edition_size", "price_eur")


def norm(v):
    if isinstance(v, str):
        v = unicodedata.normalize("NFKD", v).encode("ascii", "ignore").decode().lower()
        return " ".join(v.replace("’", "'").split())
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def by_file(path):
    return {p["file"]: p for p in json.load(open(path))["posters"]}


def score(truth_dir, a, b=None):
    A, B = by_file(a), by_file(b) if b else {}
    tot = dict(pins=0, found=0, fields=0, correct=0, agree=0, agree_wrong=0, disagree=0, disagree_caught=0, extra=0)
    for t in sorted(pathlib.Path(truth_dir).glob("*.truth.json")):
        f = t.name.replace(".truth.json", ".png")
        truth = json.load(open(t))["pins"]
        ea = {p["position"]: p for p in A.get(f, {}).get("pins", [])}
        eb = {p["position"]: p for p in B.get(f, {}).get("pins", [])}
        tot["pins"] += len(truth)
        tot["extra"] += len([k for k in ea if k > len(truth)])
        for tp in truth:
            pa, pb = ea.get(tp["position"]), eb.get(tp["position"])
            if pa:
                tot["found"] += 1
            for fld in FIELDS:
                tot["fields"] += 1
                ok_a = pa is not None and norm(pa.get(fld)) == norm(tp[fld])
                tot["correct"] += ok_a
                if b:
                    same = pa is not None and pb is not None and norm(pa.get(fld)) == norm(pb.get(fld))
                    if same:
                        tot["agree"] += 1
                        tot["agree_wrong"] += not ok_a
                    else:
                        tot["disagree"] += 1
                        tot["disagree_caught"] += not ok_a
    return tot


if __name__ == "__main__":
    r = score(*sys.argv[1:4])
    print(json.dumps(r))
    print(f"pins found {r['found']}/{r['pins']}; field accuracy {r['correct']}/{r['fields']} = {100 * r['correct'] / r['fields']:.1f}%; extra pins {r['extra']}")
    if len(sys.argv) > 3:
        print(f"A/B agree on {r['agree']} fields ({r['agree_wrong']} of those wrong); disagree on {r['disagree']} "
              f"({r['disagree_caught']} of which A was wrong)")
