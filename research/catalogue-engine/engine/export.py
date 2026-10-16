"""Outputs: Excel review workbook, Master-Catalogue-shaped CSV (inert import actions) and evidence JSON."""
import json
import datetime as dt
from collections import Counter
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from .sources import market_of

# Column order of the live trusted Master Catalogue tab (import-trusted-catalogue.mjs reads these names).
MASTER_COLUMNS = ["pinhunt_id", "Pin name", "Brand", "Series", "Characters", "Release year", "Edition size", "external_ids",
                  "Categories", "Release date", "Park / Retailer", "Edition type", "Original price", "Currency",
                  "Front image URL", "Back image URL", "Source URL", "Verification status", "Notes", "Main character",
                  "All characters", "Programme", "Collection name", "Release wave", "Release scope", "Collection type",
                  "Normalised series name", "Search aliases", "Character validation", "Expected pin count",
                  "Set count check", "Validation tier", "Validation notes", "Import action", "Main subject",
                  "Subject type", "Validation source 2", "Validated date", "Catalogue status", "Safe for app search",
                  "Confidence basis"]
EXTRA_COLUMNS = ["research_key", "record_confidence", "verified", "review_status", "warnings", "duplicate_status", "duplicate_of", "duplicate_basis",
                 "field_conflicts", "inherited_fields", "pin_name_source", "visual_form", "visual_colours", "visual_features", "pack_product_code",
                 "Manufacturer", "Retailer"]

def safe_cell(v):
    """Neutralise spreadsheet formula injection from source-derived text (=, +, -, @, tab, CR)."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


FILL = {"High": "C6EFCE", "Medium": "FFEB9C", "Low": "FFC7CE", "Unverified": "D9D9D9", "conflict": "F4B183", "variants": "FFF2CC", "regional variants": "DDEBF7", "Yes": "C6EFCE",
        "NEEDS REVIEW": "FFC7CE", "READY FOR HUMAN SIGN-OFF": "C6EFCE"}


# Home retail market of a research line: a record from that line takes its own market's value
# when official stores differ by market ("regional variants"), and nothing when only other
# markets are evidenced; the joined value stays in the research output for reviewers.
HOME_MARKET = {"dsuk": "UK"}
# Facts that belong to one market: a value evidenced only by other markets' official stores is
# not this record's value.
MARKET_FIELDS = {"original_price", "price", "currency"}


def _v(f, name, home=None):
    r = f.get(name)
    if not r or r.get("value") in (None, []):
        return ""
    v = r["value"]
    if home and r.get("by_market"):
        if home not in r["by_market"]:
            return ""            # only other markets' values: unknown for this record's market
        v = r["by_market"][home]
    elif home and name in MARKET_FIELDS:
        markets = {market_of(u) for u in r.get("urls", [])}
        if markets and "" not in markets and home not in markets:
            return ""
    return "; ".join(map(str, v)) if isinstance(v, list) else v


def _year(date):
    """Year of an evidenced release date (YYYY or YYYY-MM[-DD]); '' when there is none."""
    s = str(date or "")
    return int(s[:4]) if len(s) >= 4 and s[:4].isdigit() else ""


# Catalogue brand vocabulary (trusted catalogue: "Disney Store", "Disney Parks"), derived only
# from evidence: an issuer claim, else where the pin was sold (release_location).
_PARKS = ("disneyland", "disney world", "walt disney world", "epcot", "magic kingdom", "hollywood studios",
          "animal kingdom", "disney california adventure", "pueblo trading", "disney parks", "park")


def _brand(issuer, location):
    for text in (issuer, location):
        t = str(text or "").lower()
        if "disney store" in t or "shopdisney" in t:
            return "Disney Store"
        if any(k in t for k in _PARKS):
            return "Disney Parks"
    return str(issuer or "")


def _set_chain(sets, key):
    out = []
    while key:
        out.append(sets.get(key))
        key = sets.get(key, {}).get("parent") if sets.get(key) else ""
    return [s for s in out if s]


def _from_chain(chain, field, home=None):
    for s in chain:
        v = _v(s["fields"], field, home)
        if v != "":
            return v
    return ""


def build_rows(pins, sets, dupes, run_date):
    rows = []
    for key, p in sorted(pins.items()):
        f, chain = p["fields"], _set_chain(sets, p["set_key"])
        home = HOME_MARKET.get(key.split("/")[0])
        family = _from_chain(chain[1:] or chain, "set_name", home) or _from_chain(chain, "family", home) or key.split("/")[0]
        set_name = _v(chain[0]["fields"], "set_name", home) if chain else ""
        chars = f.get("characters", {}).get("value") or []
        main = _v(f, "main_character", home) or (chars[0] if len(chars) == 1 else "")
        subject = main or _v(f, "attraction", home)
        name = _v(f, "pin_name", home)
        conflicts = [k for k, r in f.items() if r["status"] == "conflict"]
        verified = p["record_confidence"] in ("High", "Medium") and not any(x.startswith("conflict") for x in p["review_reasons"])
        inherited = [k for k, r in f.items() if r.get("inherited_from")]
        dstat, did, dbasis = dupes.get(key, ("", "", ""))
        review = "NEEDS REVIEW" if p["review_reasons"] or dstat.startswith("PROBABLE") else "READY FOR HUMAN SIGN-OFF"
        action = {"DUPLICATE": "RESEARCH-DUPLICATE (compare/enrich existing row)",
                  "PROBABLE DUPLICATE": "RESEARCH-REVIEW"}.get(dstat, "RESEARCH-NEW (needs pinhunt_id at import)")
        urls = sorted({u for r in f.values() for u in r.get("urls", [])}, key=lambda u: ("disneystore" not in u and "disney.go" not in u, u))
        codes = [c for c in [_v(f, "product_code", home)] if c]
        row = {c: "" for c in MASTER_COLUMNS + EXTRA_COLUMNS}
        row.update({
            "pinhunt_id": did if dstat == "DUPLICATE" else "",
            "Pin name": name or (f"{subject or ' & '.join(chars)} – {set_name}" if (subject or chars) and set_name else ""),
            "Brand": _brand(_from_chain(chain, "issuer", home), _v(f, "release_location", home) or _from_chain(chain, "release_location", home))
                     or ("Disney Store" if any(("disneystore." in u or "shopdisney." in u) for u in urls) else ""),
            "Series": set_name, "Characters": "; ".join(chars),
            "Release year": _v(f, "release_year", home) or _year(_v(f, "release_date", home) or _from_chain(chain, "release_date", home)),
            "Edition size": _v(f, "edition_size", home),
            "external_ids": "; ".join(f"Disney product code: {c}" for c in codes),
            "Categories": "; ".join(x for x in [family, _v(f, "visual_form", home), _v(f, "visual_features", home)] if x),
            "Release date": _v(f, "release_date", home), "Park / Retailer": _v(f, "release_location", home),
            "Edition type": _v(f, "edition_type", home), "Original price": _v(f, "original_price", home), "Currency": _v(f, "currency", home),
            "Source URL": urls[0] if urls else "", "Validation source 2": urls[1] if len(urls) > 1 else "",
            "Verification status": f"Research – {p['record_confidence']}",
            "Notes": _v(f, "visual_description", home), "Main character": main, "All characters": "; ".join(chars),
            "Programme": family, "Collection name": set_name, "Release wave": _from_chain(chain, "sub_series", home),
            "Release scope": _v(f, "region", home), "Collection type": _from_chain(chain, "format", home),
            "Normalised series name": " | ".join(str(x) for x in [family, _v(f, "release_year", home), _v(f, "release_location", home), set_name] if x),
            "Search aliases": "; ".join(dict.fromkeys(x for x in [set_name, family, _from_chain(chain, "sub_series", home)] if x)),
            "Character validation": f.get("characters", {}).get("confidence", ""),
            "Expected pin count": chain[0]["expected"] if chain and chain[0]["expected"] is not None else "",
            "Set count check": chain[0]["completeness"] if chain else "",
            "Validation tier": f"Research {p['record_confidence']}", "Validation notes": "; ".join(p["review_reasons"]),
            "Import action": action, "Main subject": subject, "Subject type": "Character" if main else ("Attraction" if subject else ""),
            "Validated date": run_date, "Catalogue status": "Research candidate (not for import)", "Safe for app search": "No",
            "Confidence basis": f"{p['n_publishers']} independent publishers; {sum(r.get('official', 0) for r in f.values())} official claims; {p['n_evidence_claims']} evidence claims",
            "research_key": key, "record_confidence": p["record_confidence"], "verified": "Yes" if verified else "No",
            "review_status": review, "warnings": "; ".join(p.get("warnings", [])),
            "duplicate_status": dstat, "duplicate_of": did, "duplicate_basis": dbasis,
            "field_conflicts": "; ".join(conflicts), "inherited_fields": "; ".join(inherited),
            "pin_name_source": "claimed" if name else ("composed display label (subject – set)" if subject and set_name else ""),
            "visual_form": _v(f, "visual_form", home), "visual_colours": _v(f, "visual_colours", home),
            "visual_features": _v(f, "visual_features", home), "pack_product_code": _v(f, "pack_product_code", home),
            # Licensed pins: who made it and who sold it are separate facts, so a Loungefly pin sold at
            # BoxLunch is counted once per dimension, never twice.
            "Manufacturer": _v(f, "manufacturer", home) or _from_chain(chain, "manufacturer", home),
            "Retailer": _v(f, "retailer", home) or _from_chain(chain, "retailer", home),
        })
        rows.append(row)
    return rows


def write_outputs(out_dir, store, pins, sets, dupes, seed_notes=None):
    run_date = dt.date.today().isoformat()
    rows = build_rows(pins, sets, dupes, run_date)
    import csv, os
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/master_catalogue_candidates.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=MASTER_COLUMNS + EXTRA_COLUMNS)
        w.writeheader(), w.writerows([{k: safe_cell(v) for k, v in r.items()} for r in rows])
    claims_by_id = {c["claim_id"]: c for c in store.claims}
    with open(f"{out_dir}/records_with_evidence.json", "w") as fh:
        json.dump(dict(generated=run_date, note="Research output. Not import-safe: pinhunt_ids are never minted here.",
                       pins=[dict(key=k, set_key=p["set_key"], record_confidence=p["record_confidence"],
                                  review_reasons=p["review_reasons"], duplicate=dupes.get(k),
                                  fields={fn: dict(value=r.get("value"), confidence=r.get("confidence"), status=r["status"],
                                                   alternatives=r.get("alternatives"), inherited_from=r.get("inherited_from"),
                                                   derived_from=r.get("derived_from"),
                                                   evidence=[dict(claim_id=i, url=claims_by_id[i]["url"], method=claims_by_id[i]["method"],
                                                                  source_class=claims_by_id[i]["source_class"]) for i in r["evidence_ids"] if i in claims_by_id])
                                          for fn, r in p["fields"].items()}) for k, p in sorted(pins.items())],
                       sets=[dict(key=k, parent=s["parent"], expected=s["expected"], found=s["found"], completeness=s["completeness"],
                                  fields={fn: dict(value=r.get("value"), confidence=r.get("confidence"), status=r["status"]) for fn, r in s["fields"].items()})
                             for k, s in sorted(sets.items())]), fh, indent=1, default=str)

    write_staging_payload(f"{out_dir}/staging_payload.json", store, pins, sets, rows, run_date)

    wb = Workbook()
    def sheet(title, data, first=False, widths=None):
        ws = wb.active if first else wb.create_sheet(title)
        ws.title = title
        if data and isinstance(data[0], dict):
            cols = list(data[0].keys())
            ws.append(cols)
            for d in data:
                ws.append([safe_cell(", ".join(map(str, d[c])) if isinstance(d[c], (list, tuple, set)) else d[c]) for c in cols])
        else:
            for d in data:
                ws.append([safe_cell(x) for x in d])
        for c in ws[1]:
            c.font, c.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="2F5D62")
        ws.freeze_panes = "A2"
        for i, col in enumerate(ws.columns, 1):
            L = max((len(str(c.value)) if c.value is not None else 0) for c in col)
            ws.column_dimensions[get_column_letter(i)].width = min(max(10, L + 2), (widths or {}).get(i, 50))
        for row in ws.iter_rows(min_row=2):
            for c in row:
                c.alignment = Alignment(wrap_text=True, vertical="top")
                if isinstance(c.value, str):
                    key = c.value.replace("Research – ", "").replace("Research ", "")
                    if key in FILL:
                        c.fill = PatternFill("solid", fgColor=FILL[key])
        if data and isinstance(data[0], dict):
            ws.auto_filter.ref = ws.dimensions
        return ws

    conf = Counter(p["record_confidence"] for p in pins.values())
    dcount = Counter(d[0] for d in dupes.values())
    review = sum(1 for r in rows if r["review_status"] == "NEEDS REVIEW")
    summary = [("PinHunt catalogue research engine — run summary", ""), ("Run date", run_date),
               ("Packets", len(store.packets)), ("Accepted claims", len(store.claims)), ("Rejected claims", len(store.rejected)),
               ("Distinct sources (accepted)", len({c['url'] for c in store.claims if c['url']})),
               ("Pins", len(pins)), ("Sets", len(sets)),
               *[(f"Record confidence: {k}", conf.get(k, 0)) for k in ("High", "Medium", "Low", "Unverified")],
               *[(f"Duplicate status: {k}", v) for k, v in dcount.most_common()],
               ("Verified pins (identity High/Medium from ≥1 non-legacy source, no blocking conflict)", sum(1 for r in rows if r["verified"] == "Yes")),
               ("Needs review", review), ("Ready for human sign-off", len(rows) - review),
               ("Field conflicts", sum(1 for p in pins.values() for r in p["fields"].values() if r["status"] == "conflict")),
               ("Safety", "Import action values are RESEARCH-* and Catalogue status is 'Research candidate', so the existing "
                          "trusted importer (which only takes UPSERT + 'Trusted test record' + Safe=Yes) ignores every row."),
               ("Evidence rule", "Every non-empty value traces to ≥1 accepted claim (see Field Evidence). Values are never generated.")]
    sheet("Summary", summary, first=True, widths={1: 45, 2: 110})
    sheet("Review Queue", [dict(research_key=r["research_key"], pin=r["Pin name"], record_confidence=r["record_confidence"],
                                duplicate_status=r["duplicate_status"], reasons=r["Validation notes"], conflicts=r["field_conflicts"],
                                warnings=r["warnings"])
                           for r in rows if r["review_status"] == "NEEDS REVIEW"] or [dict(research_key="", pin="none")])
    sheet("Master Catalogue", rows)
    sheet("Sets", [dict(set_key=k, parent=s["parent"], set_name=_v(s["fields"], "set_name"), issuer=_v(s["fields"], "issuer"),
                        format=_v(s["fields"], "format"), expected=s["expected"], found=s["found"], completeness=s["completeness"],
                        release_date=_v(s["fields"], "release_date"), region=_v(s["fields"], "region"), price=_v(s["fields"], "price"),
                        currency=_v(s["fields"], "currency"), pack_product_code=_v(s["fields"], "pack_product_code"),
                        conflicts="; ".join(fn for fn, r in s["fields"].items() if r["status"] == "conflict"),
                        seed_note=(seed_notes or {}).get(k, ""))
                   for k, s in sorted(sets.items())])
    sheet("Duplicates", [dict(research_key=k, status=v[0], existing_pinhunt_id=v[1], basis=v[2]) for k, v in sorted(dupes.items())])
    fe = []
    for et, items in (("set", sets), ("pin", pins)):
        for k, p in sorted(items.items()):
            for fn, r in sorted(p["fields"].items()):
                v = r.get("value")
                fe.append(dict(entity=et, key=k, field=fn, value="; ".join(map(str, v)) if isinstance(v, list) else v,
                               confidence=r.get("confidence"), status=r["status"], publishers=r.get("publishers", []),
                               official_claims=r.get("official", 0), methods=r.get("methods", []),
                               inherited_from=r.get("inherited_from", ""), derived_from=r.get("derived_from", ""),
                               alternatives=r.get("alternatives", ""), claim_ids=r["evidence_ids"]))
    sheet("Field Evidence", fe)
    sheet("Claims", [dict(claim_id=c["claim_id"], entity=c["entity_type"], key=c["key"], field=c["field"],
                          value="; ".join(map(str, c["value"])) if isinstance(c["value"], list) else c["value"],
                          method=c["method"], source_class=c["source_class"], publisher=c["publisher"], url=c["url"],
                          note=c["note"], packet=c["packet_id"]) for c in store.claims])
    sheet("Rejected Claims", [dict(claim_id=c["claim_id"], key=c["key"], field=c["field"], raw_value=str(c["raw_value"])[:200],
                                   url=c["url"], reason=c["reason"], packet=c["packet_id"]) for c in store.rejected]
          or [dict(claim_id="", reason="none")])
    src = Counter((c["url"], c["source_class"], c["publisher"]) for c in store.claims)
    sheet("Sources", [dict(url=u, source_class=cl, publisher=p, accepted_claims=n,
                           accessed_via=store.sources.get(u, {}).get("accessed_via", ""),
                           page_readable=store.sources.get(u, {}).get("page_readable", ""))
                      for (u, cl, p), n in src.most_common()])
    sheet("Gaps", [dict(key=n.get("key"), field=n.get("field"), searched=n.get("searched"), note=n.get("note"), packet=n["packet_id"])
                   for n in store.not_found] or [dict(key="", field="none")])
    sheet("Packets", store.packets)
    wb.save(f"{out_dir}/catalogue_research_output.xlsx")
    return rows


STAGING_FORMAT = "pinhunt-research-run/v1"
# Master Catalogue columns carried into catalogue_candidates.proposed (values only).
PROPOSED_COLUMNS = ["Pin name", "Brand", "Series", "Characters", "Main character", "Release year", "Release date",
                    "Edition type", "Edition size", "Park / Retailer", "Release scope", "Original price", "Currency",
                    "external_ids", "Categories", "Notes", "Collection name", "Release wave", "Collection type",
                    "Expected pin count", "Set count check", "visual_form", "visual_colours", "visual_features",
                    "pack_product_code", "pin_name_source", "Manufacturer", "Retailer"]


def _claim_out(c):
    return dict(field=c["field"], value=c["value"], source_url=c["url"] or None, publisher=c.get("publisher") or None,
                source_class=c.get("source_class") or "none", method=c["method"], note=c["note"] or None,
                claim_ref=c["claim_id"])


def write_staging_payload(path, store, pins, sets, rows, run_date, only_keys=None):
    """Payload for POST /api/admin/research/runs (loaded into catalogue_* staging tables)."""
    import subprocess
    from . import SPEC_VERSION
    try:
        commit = subprocess.run(["git", "rev-parse", "--short=12", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        commit = "0000000"
    by_key = {}
    for c in store.claims:
        by_key.setdefault(c["key"], []).append(_claim_out(c))
    row_by_key = {r["research_key"]: r for r in rows}
    cands = []
    for key, p in sorted(pins.items()):
        if only_keys is not None and key not in only_keys:
            continue
        r = row_by_key[key]
        cands.append(dict(
            research_key=key, entity_type="pin", set_research_key=p["set_key"],
            proposed={k: r[k] for k in PROPOSED_COLUMNS if r.get(k) not in ("", None)},
            record_confidence=p["record_confidence"], engine_verified=r["verified"] == "Yes",
            review_reasons=p["review_reasons"], warnings=p.get("warnings", []),
            duplicate_status=r["duplicate_status"] or "NEW", duplicate_pinhunt_id=r["duplicate_of"] or None,
            evidence=by_key.get(key, [])))
    wanted_sets = {c["set_research_key"] for c in cands}
    for key, s in sorted(sets.items()):
        if only_keys is not None and key not in wanted_sets:
            continue
        f = s["fields"]
        name = f.get("set_name") or f.get("family") or {}
        cands.append(dict(
            research_key=key, entity_type="set", set_research_key=s["parent"] or None,
            proposed={k: (", ".join(map(str, r["value"])) if isinstance(r.get("value"), list) else r.get("value"))
                      for k, r in f.items() if r.get("value") not in (None, [], "")},
            record_confidence=name.get("confidence") or "Unverified", engine_verified=False,
            review_reasons=[f"set {s['completeness']}"] if s["completeness"].startswith(("incomplete", "over")) else [],
            warnings=[f"variants: {k}" for k, r in f.items() if r["status"] in ("variants", "conflict")],
            duplicate_status="NEW", duplicate_pinhunt_id=None, evidence=by_key.get(key, [])))
    with open(path, "w") as fh:
        json.dump(dict(format=STAGING_FORMAT, engine_version=f"engine-spec-v{SPEC_VERSION}", git_commit=commit,
                       generated=run_date, candidates=cands), fh, indent=1, default=str)
    return len(cands)
