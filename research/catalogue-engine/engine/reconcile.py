"""Per-field reconciliation with evidence retention. The engine can only ever choose among claimed values."""
from collections import defaultdict
from .normalize import (LIST_FIELDS, TEXT_FIELDS, EVIDENCE_METHODS, dates_compatible, norm_key)
from .sources import market_of

RANK = {"High": 3, "Medium": 2, "Low": 1, "Unverified": 0}
INHERITABLE = ("release_date", "release_location", "region", "edition_type", "currency")
CRITICAL_PIN = ("characters", "release_date", "edition_type", "release_location")
# Disagreement on these changes WHICH pin it is → blocks sign-off. Elsewhere disagreement is
# expected variance (retailer titles, regional prices/codes, store vs park dates) → warning only.
BLOCKING = {"characters", "main_character", "attraction", "edition_size", "edition_type", "is_chaser", "expected_pin_count"}
IDENTITY = ("characters", "main_character", "attraction", "pin_name")


def confidence(claims) -> str:
    ev = [c for c in claims if c["method"] in EVIDENCE_METHODS]
    # Fan pin databases corroborate only weakly: they never count as an independent publisher.
    pubs = {c["publisher"] for c in ev if not c.get("fan_database")}
    official = any(c["source_class"] == "official" for c in ev)
    if ev and not pubs and not official:
        return "Low"
    if any(c["method"] == "physical_pin" for c in ev) or any(c["source_class"] == "official" and c["method"] == "page_fetch" for c in ev):
        return "High"
    if official and len(pubs) >= 2:
        return "High"
    if len(pubs) >= 2 or official:
        return "Medium"
    if len(pubs) == 1:
        return "Low"
    return "Unverified"


def _fmt(v):
    return "; ".join(map(str, v)) if isinstance(v, list) else ("" if v is None else str(v))


def reconcile_field(field, claims):
    """→ dict(value, confidence, status, n_claims, publishers, official, evidence_ids, alternatives)"""
    out = dict(field=field, n_claims=len(claims), evidence_ids=[c["claim_id"] for c in claims], alternatives="", status="ok")
    if field in LIST_FIELDS:
        items = defaultdict(list)
        for c in claims:
            for it in c["value"]:
                items[norm_key(it)].append((it, c))
        kept, weak = [], []
        confs = []
        for k, lst in items.items():
            cs = [c for _, c in lst]
            conf = confidence(cs)
            (kept if conf != "Unverified" else weak).append(lst[0][0])
            if conf != "Unverified":
                confs.append(conf)
        out["value"] = sorted(kept, key=str.lower) or None
        out["confidence"] = min(confs, key=RANK.get) if confs else ("Unverified" if weak else None)
        if weak:
            out["alternatives"] = "editorial/legacy only: " + "; ".join(weak)
            if not kept:
                out["value"] = None
                out["status"] = "unverified"
    elif field in TEXT_FIELDS:
        ev = [c for c in claims if c["method"] in EVIDENCE_METHODS]
        distinct = {}
        for c in ev:
            distinct.setdefault(norm_key(c["value"]), c["value"])
        out["value"] = " | ".join(distinct.values()) or None
        out["confidence"] = confidence(claims) if ev else "Unverified"
        if not ev:
            out["alternatives"] = "editorial/legacy only: " + " | ".join({_fmt(c["value"]) for c in claims})
            out["status"] = "unverified"
    else:
        groups = []          # [representative value, [claims]]
        for c in claims:
            v = c["value"]
            for g in groups:
                same = dates_compatible(str(g[0]), str(v)) if field == "release_date" else norm_key(g[0]) == norm_key(v)
                if same:
                    if field == "release_date" and len(str(v)) > len(str(g[0])):
                        g[0] = v           # keep the most precise compatible date
                    g[1].append(c)
                    break
            else:
                groups.append([v, [c]])
        ev_groups = [g for g in groups if any(c["method"] in EVIDENCE_METHODS for c in g[1])]
        pool = ev_groups or groups
        pool.sort(key=lambda g: (RANK[confidence(g[1])], len({c["publisher"] for c in g[1] if c["method"] in EVIDENCE_METHODS})), reverse=True)
        best = pool[0]
        out["value"], out["confidence"] = best[0], confidence(best[1])
        if not ev_groups:
            out["status"] = "unverified"
            out["alternatives"] = "editorial/legacy only: " + " || ".join(_fmt(g[0]) for g in groups)
            out["value"] = None          # never present unevidenced values as facts
        if len(ev_groups) > 1:
            out["status"] = "conflict" if field in BLOCKING else "variants"
            mk = [{market_of(c["url"]) for c in g[1] if c["method"] in EVIDENCE_METHODS} for g in ev_groups]
            if all(m and "" not in m for m in mk) and all(not (a & b) for i, a in enumerate(mk) for b in mk[i + 1:]):
                out["status"] = "regional variants"
                out["value"] = " | ".join(f"{'/'.join(sorted(m))}: {_fmt(g[0])}" for m, g in zip(mk, ev_groups))
            out["alternatives"] = " || ".join(f"{_fmt(g[0])} ({len({c['publisher'] for c in g[1]})} src: {', '.join(sorted({c['publisher'] for c in g[1]}))})" for g in ev_groups)
        claims = best[1]
    ev = [c for c in claims if c["method"] in EVIDENCE_METHODS]
    out["publishers"] = sorted({c["publisher"] for c in ev})
    out["official"] = sum(1 for c in ev if c["source_class"] == "official")
    out["methods"] = sorted({c["method"] for c in claims})
    out["urls"] = sorted({c["url"] for c in claims if c["url"]})
    return out


def reconcile(store):
    by = defaultdict(list)
    for c in store.claims:
        by[(c["entity_type"], c["key"], c["field"])].append(c)
    fields = defaultdict(dict)                    # (etype,key) -> field -> result
    for (et, key, field), cl in by.items():
        fields[(et, key)][field] = reconcile_field(field, cl)

    sets = {}
    for key, parent in store.sets.items():
        f = fields.get(("set", key), {})
        members = [k for k, sk in store.pins.items() if sk == key]
        exp = f.get("expected_pin_count", {}).get("value")
        found = len(members)
        if exp is None:
            completeness = "unknown (no expected count claimed)" if members else "family / parent set"
        elif found == exp:
            completeness = "complete"
        elif found < exp:
            completeness = f"incomplete ({found}/{exp}) — missing pins are NOT created"
        else:
            completeness = f"over ({found}/{exp}) — check for variants or wrong set"
        sets[key] = dict(key=key, parent=parent, fields=f, members=members, found=found, expected=exp, completeness=completeness)

    ev_by_key = defaultdict(list)
    for c in store.claims:
        if c["method"] in EVIDENCE_METHODS:
            ev_by_key[c["key"]].append(c)
    pins = {}
    for key, sk in store.pins.items():
        f = dict(fields.get(("pin", key), {}))
        # Inherit set-level facts the pin itself has no claim for (provenance kept).
        chain, k = [], sk
        while k:
            chain.append(k)
            k = store.sets.get(k, "")
        for fld in INHERITABLE:
            if fld in f and f[fld].get("value") not in (None, []):
                continue
            for anc in chain:
                sf = fields.get(("set", anc), {}).get(fld)
                if sf and sf.get("value") not in (None, []) and sf["status"] != "unverified":
                    f[fld] = dict(sf, inherited_from=anc)
                    break
        if "release_year" not in f and f.get("release_date", {}).get("value"):
            rd = f["release_date"]
            import re as _re
            years = {int(y) for y in _re.findall(r"\b(20\d\d)-\d\d", str(rd.get("alternatives", "")))} or {int(str(rd["value"])[:4])}
            f["release_year"] = dict({k: v for k, v in rd.items() if k != "inherited_from"}, value=int(str(rd["value"])[:4]),
                                    derived_from="release_date", status="ok" if len(years) == 1 else "conflict",
                                    alternatives="" if len(years) == 1 else rd.get("alternatives", ""))
        ev_claims = ev_by_key.get(key, [])
        # Identity = any claim that names the pin (characters, attraction, retailer title), pooled across publishers.
        ident_claims = [c for c in ev_claims if c["field"] in IDENTITY]
        rec_conf = confidence(ident_claims) if ident_claims else "Unverified"
        if any(f.get(k, {}).get("status") == "conflict" for k in ("characters", "main_character", "attraction")):
            rec_conf = "Low" if rec_conf != "Unverified" else rec_conf
        reasons, warnings = [], []
        for fld, r in f.items():
            if r["status"] == "conflict":
                reasons.append(f"conflict: {fld}")
            elif r["status"] == "variants":
                warnings.append(f"variants: {fld}")
        if RANK.get(rec_conf, 0) <= 1:
            reasons.append(f"identity confidence {rec_conf}")
        missing = [c for c in CRITICAL_PIN if not f.get(c, {}).get("value")]
        if "characters" in missing and f.get("attraction", {}).get("value"):
            missing.remove("characters")      # attraction pins are identified by the attraction
        if missing:
            reasons.append("missing: " + ", ".join(missing))
        pins[key] = dict(key=key, set_key=sk, fields=f, record_confidence=rec_conf, review_reasons=reasons, warnings=warnings,
                         n_evidence_claims=len(ev_claims),
                         n_publishers=len({c["publisher"] for c in ev_claims if not c.get("fan_database")}))
    for s in sets.values():
        if s["completeness"].startswith(("incomplete", "over")):
            for m in s["members"]:
                pins[m]["review_reasons"].append(f"set {s['completeness'].split(' —')[0]}")
    return pins, sets
