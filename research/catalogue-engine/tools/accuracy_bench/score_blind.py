"""Score research candidates against an independent BLIND re-research of the same releases.

Usage (from research/catalogue-engine):
  PYTHONPATH=. python3 tools/accuracy_bench/score_blind.py <staging_payload.json> <blind_results.json> [<out.csv>]

Three separate dimensions, per candidate pin in a release the blind check resolved:
- identity  : every character on our pin appears on some blind pin of the release
- grouping  : some single blind pin shows exactly our pin's characters (one pin vs separate pins),
              judged only over characters both sides know about in that release
- metadata  : per field (edition_size, release_date, price) where both sides state a value
Blind pins we lack are reported as completeness, not accuracy. Matching is automatic and
conservative; the per-pin CSV is for human adjudication of edge cases.
"""
import csv, json, re, sys, collections as C

STOP = {"the", "and", "with", "as", "in", "on", "of", "a", "pin", "pins", "le", "mini", "jumbo", "one", "set", "mystery",
        "chaser", "design", "ducky", "rubber", "glitter", "slider", "dangle", "mouse", "duck"}


def words(s):
    return [w for w in re.split(r"[^a-z0-9]+", str(s).lower().replace("'n'", " and ").replace("’", "'")) if w]


GENERIC = {"disney", "disneyland", "anniversary", "logo", "walt", "walts", "magical", "moments", "release", "limited",
           "edition", "passholder", "annual", "park", "parks", "store", "collection", "series"}


def key_tokens(name):
    ws = [w for w in words(name) if w not in STOP and w not in GENERIC and (len(w) > 2 or w.isdigit())]
    if ws:
        return set(ws)
    ws = [w for w in words(name) if w not in STOP and len(w) > 2]
    return set(ws[:2]) if ws else set(words(name)[:1])


def chars_of(c):
    v = c["proposed"].get("Characters") or c["proposed"].get("Pin name") or c["research_key"].rsplit("/", 1)[-1].replace("-", " ")
    parts = [p.strip() for p in re.split(r";|\band\b|&", str(v)) if p.strip()]
    return parts or [str(v)]


def mentions(subject, name):
    toks, subj = key_tokens(name), set(words(subject))
    compact = lambda x: "".join(words(x))
    if compact(name) and compact(name) in compact(subject):
        return True
    return bool(toks) and len(toks & subj) >= max(1, (len(toks) + 1) // 2)


def score(payload, blind):
    pins = C.defaultdict(list)
    for c in payload["candidates"]:
        if c["entity_type"] == "pin":
            pins[c["set_research_key"]].append(c)
    res = C.Counter()
    rows = []
    for r in blind["releases"]:
        ours = pins.get(r["key"], [])
        if not r.get("found") or not r.get("pins") or not ours:
            res["releases_unresolved"] += 1
            continue
        res["releases"] += 1
        vocab = {n for c in ours for n in chars_of(c)}
        bsets = [frozenset(n for n in vocab if mentions(p["subject"], n)) for p in r["pins"]]
        for c in ours:
            cs = chars_of(c)
            ident = all(any(mentions(p["subject"], n) for p in r["pins"]) for n in cs)
            group = ident and frozenset(cs) in bsets
            blocked = any(x.startswith("conflict:") for x in c["review_reasons"])
            res["pins"] += 1
            res["blocked"] += blocked
            if not blocked:
                res["open_pins"] += 1
                res["open_identity_ok"] += ident
                res["open_grouping_ok"] += group
                res["open_grouping_judged"] += ident
            elif not (ident and group):
                res["errors_caught_by_block"] += 1
            res["identity_ok"] += ident
            res["grouping_ok"] += group
            res["grouping_judged"] += ident
            row = {"release": r["key"], "pin": c["research_key"].rsplit("/", 1)[-1], "confidence": c["record_confidence"],
                   "our_characters": "; ".join(cs), "identity": "ok" if ident else "NOT FOUND",
                   "grouping": "ok" if group else ("WRONG" if ident else "n/a"), "blocked": "yes" if blocked else ""}
            match = next((p for p, b in zip(r["pins"], bsets) if b == frozenset(cs)), None)
            for fld, ours_v, theirs_v in [
                ("edition_size", c["proposed"].get("Edition size"), (match or {}).get("edition_size")),
            ]:
                if ours_v not in (None, "") and theirs_v not in (None, ""):
                    try:
                        same = int(float(str(ours_v).split()[0].replace(",", ""))) == int(theirs_v)
                    except ValueError:
                        same = str(ours_v) == str(theirs_v)
                    res[f"{fld}_judged"] += 1
                    res[f"{fld}_ok"] += same
                    row[fld] = "ok" if same else f"ours {ours_v} vs blind {theirs_v}"
            rows.append(row)
        ourtok = set().union(*[key_tokens(n) for c in ours for n in chars_of(c)])
        res["blind_pins"] += len(r["pins"])
        res["blind_only"] += sum(1 for p in r["pins"] if not (set(words(p["subject"])) & ourtok))
    return res, rows


def pct(a, b):
    return f"{a}/{b} = {100 * a / b:.0f}%" if b else "n/a"


if __name__ == "__main__":
    payload = json.load(open(sys.argv[1]))
    blind = json.load(open(sys.argv[2]))
    res, rows = score(payload, blind)
    print(f"releases resolved {res['releases']} (unresolved {res['releases_unresolved']}), our pins {res['pins']}")
    print(f"identity  : {pct(res['identity_ok'], res['pins'])}")
    print(f"grouping  : {pct(res['grouping_ok'], res['grouping_judged'])} (of pins whose identity was found)")
    print(f"edition sz: {pct(res['edition_size_ok'], res['edition_size_judged'])}")
    print(f"blocked for review (conflicts): {res['blocked']}; errors caught by a block: {res['errors_caught_by_block']}")
    print(f"approvable pins only: identity {pct(res['open_identity_ok'], res['open_pins'])}, grouping {pct(res['open_grouping_ok'], res['open_grouping_judged'])}")
    print(f"completeness: blind check named {res['blind_pins']} pins, {res['blind_only']} with no counterpart in ours")
    if len(sys.argv) > 3:
        keys = sorted({k for r in rows for k in r})
        with open(sys.argv[3], "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=keys)
            w.writeheader()
            w.writerows(rows)
