"""Convert the Oct-2026 POC raw research JSON into a legacy evidence packet.

POC records tied facts to a *record-level* list of sources, not field-level, so
these claims use method 'legacy_record': the engine shows them but they never
count as evidence on their own. They are a baseline that new field-level
packets must confirm.
"""
import json
import re
import pathlib

FIELD_MAP = {"characters": "characters", "franchise_film": "franchise", "franchise": "franchise", "attraction_park": "attraction",
             "set_position": "set_position", "pin_type": "edition_type", "edition_size": "edition_size",
             "release_date": "release_date", "release_region_venue": "release_location", "release_region": "release_location",
             "currency": "currency", "is_chaser": "is_chaser", "materials_features": "visual_description"}


def convert(poc_dir, keys_json, out_path):
    keys = json.load(open(keys_json))
    by_name = {k["pin_name"]: k for k in keys}
    pins = []
    for f in sorted(pathlib.Path(poc_dir).glob("research_*.json")):
        for p in json.load(open(f))["pins"]:
            k = by_name.get(p["pin_name"])
            if not k:
                continue
            url = (p.get("source_urls") or [""])[0]
            claims = []
            for src, dst in FIELD_MAP.items():
                v = p.get(src)
                if v in (None, "", []) or (isinstance(v, str) and re.search(r"unverified|unknown|not stated", v, re.I)):
                    continue
                claims.append(dict(field=dst, value=v if not isinstance(v, dict) else json.dumps(v), source_url=url, method="legacy_record",
                                   note="POC v0 record-level attribution"))
            price = p.get("original_price")
            if isinstance(price, (int, float)):
                claims.append(dict(field="original_price", value=price, source_url=url, method="legacy_record", note="POC v0"))
            claims.append(dict(field="pin_name", value=p["pin_name"], source_url=url, method="legacy_record", note="POC v0 working name"))
            pins.append(dict(pin_key=k["pin_key"], set_key=k["set_key"], claims=claims))
    json.dump(dict(packet_id="poc-v0-legacy", spec_version=1, collected_at="2026-10-13", collector="poc-v0 (converted)",
                   pins=pins, discovery_notes="Baseline from the first POC. Not counted as evidence."), open(out_path, "w"), indent=1)
    return len(pins)


if __name__ == "__main__":
    import sys
    print(convert(*sys.argv[1:4]))
