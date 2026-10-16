"""Pipeline entry point."""
import argparse
import re
import pathlib
from .load import load_packets
from .reconcile import reconcile
from .dedupe import Catalogue, match_pin, seed_note
from .export import write_outputs, _set_chain, _from_chain, _v

ROOT = pathlib.Path(__file__).resolve().parents[3]
TRUSTED = ROOT / "attached_assets/PinHunt_UK_Trusted_Test_Catalogue_1785531320477.xlsx"
SEED = ROOT / "attached_assets/PinHunt_UK_Master_Seed_13000_Pins_Character_Enriched_1785155236773.xlsx"


GENERIC = set("""le oe open limited edition editions series set sets pin pins collection mystery box boxed jumbo mini
event events release releases trading time night disney store park parks dlp dlr wdw dsuk the of and a
jan january feb february mar march apr april may jun june jul july aug august sep sept september oct october
nov november dec december mickey minnie friends anniversary day""".split())


def _set_words(sets, set_key):
    chain = _set_chain(sets, set_key)
    text = " ".join([set_key] + [str(_v(s["fields"], "set_name")) for s in chain])
    return {w for w in re.split(r"[^a-z0-9]+", text.lower()) if len(w) > 2 and not w.isdigit() and w not in GENERIC}


def _pin_date(sets, p):
    d = str(_v(p["fields"], "release_date") or _from_chain(_set_chain(sets, p["set_key"]), "release_date") or "")
    y = str(_v(p["fields"], "release_year") or d[:4])
    return d, y


LINES = ("dlp", "dlr", "wdw", "dsuk")
VARIANT_FIELDS = ("pin_name", "is_chaser", "edition_type", "edition_size", "visual_form", "set_position")


def _same_line(k1, k2):
    """Different parks/retailers sell different pins; only compare within a line (or against unprefixed keys)."""
    a, b = k1.split("/", 1)[0], k2.split("/", 1)[0]
    return a == b or a not in LINES or b not in LINES


def cross_set_suspects(pins, sets):
    """Same subject, same year, different set, and either a shared distinctive set word or the same date.
    Flags the later key for a human; never merges."""
    by_subject = {}
    for key, p in sorted(pins.items()):
        d, y = _pin_date(sets, p)
        by_subject.setdefault((key.rsplit("/", 1)[-1], y), []).append((key, p, d))
    out = {}
    for (subject, y), group in by_subject.items():
        if not y:
            continue
        for i, (k1, p1, d1) in enumerate(group):
            for k2, p2, d2 in group[i + 1:]:
                if p1["set_key"] == p2["set_key"] or not _same_line(k1, k2):
                    continue
                shared = _set_words(sets, p1["set_key"]) & _set_words(sets, p2["set_key"]) - set(subject.split("-"))
                if shared or (d1 and len(d1) >= 7 and d1 == d2):
                    out.setdefault(k2, k1)
    return out


def duplicate_character_suggestion(chars):
    """A suggested correction (never applied) when one character name is contained in another in
    the same list, e.g. ["627", "Experiment 627", "Stitch"]. `suggest:` reasons don't block sign-off."""
    words = [(c, set(re.findall(r"[a-z0-9]+", str(c).lower()))) for c in chars]
    drop = {a for a, wa in words for b, wb in words if a != b and wa and wa < wb}
    if not drop:
        return None
    kept = [c for c in chars if c not in drop]
    return f"suggest: Characters → {'; '.join(kept)} (listed twice: {', '.join(sorted(drop))})"


def run(packet_globs, out_dir, trusted=TRUSTED, seed=SEED):
    store = load_packets(packet_globs)
    pins, sets = reconcile(store)
    cat = Catalogue(trusted, seed if seed and pathlib.Path(seed).exists() else None)
    dupes, seen = {}, {}
    for key, p in pins.items():
        chain = _set_chain(sets, p["set_key"])
        family = _from_chain(chain[1:] or chain, "set_name") or _from_chain(chain, "family") or key.split("/")[0].replace("-", " ")
        subset = (_v(chain[0]["fields"], "set_name") if chain else "") or p["set_key"].replace("-", " ")
        f = p["fields"]
        chars = f.get("characters", {}).get("value") or []
        name = " ".join(str(x) for x in [_v(f, "pin_name"), _v(f, "attraction")] if x)
        codes = {c for c in [str(_v(f, "product_code"))] if c}
        dupes[key] = match_pin(cat, family, subset, chars, name, codes, family_hint=key.split("/")[0].replace("-", " "))
        if dupes[key][0] == "PROBABLE DUPLICATE":
            p["review_reasons"].append("probable duplicate: " + dupes[key][2])
        # Pin structure is the most common snippet error (blind audit 2026-10-14): one pin showing
        # several characters vs separate pins. Ask the reviewer to confirm it on the page.
        structure = str(_v(f, "pin_structure") or "").lower()
        if len(chars) >= 2 and "separate" in structure:
            p["review_reasons"].append("conflict: pin_structure: a source says these characters are on separate pins")
        elif len(chars) >= 2 and "one" not in structure:
            p["review_reasons"].append("structure: confirm one pin showing all of these characters, not separate pins")
        dup_suggestion = duplicate_character_suggestion(chars)
        if dup_suggestion:
            p["review_reasons"].append(dup_suggestion)
        # internal duplicates vs variants: same set + same characters inside this run
        sig =(p["set_key"], tuple(sorted(c.lower() for c in chars)))
        if chars and sig in seen:
            other = pins[seen[sig]]["fields"]
            differs = [fld for fld in VARIANT_FIELDS if _v(f, fld) not in ("", None) and _v(other, fld) not in ("", None)
                       and str(_v(f, fld)).lower() != str(_v(other, fld)).lower()]
            if differs:
                p["review_reasons"].append(f"variant: same characters as {seen[sig]}; confirm the distinguishing {', '.join(differs)}")
            else:
                p["review_reasons"].append(f"possible internal duplicate of {seen[sig]}")
        seen.setdefault(sig, key)
    # Research findings recorded as not_found notes: a source showing a different grouping blocks
    # sign-off of the split records; a source showing two keys are one pin flags a duplicate.
    for nf in store.not_found:
        k, note = nf.get("key"), str(nf.get("note", "")).strip()
        if k in pins and note.lower().startswith("grouping:"):
            pins[k]["review_reasons"].append("conflict: " + note[:200])
        elif k in pins and note.lower().startswith("hold:"):
            # An explicit review hold (maintainer instruction or unresolved possible duplicate): blocks sign-off.
            pins[k]["review_reasons"].append("conflict: " + note[:200])
        elif k in pins and note.lower().startswith("variant: same pin as"):
            pins[k]["review_reasons"].append("possible internal duplicate: " + note[:200])
    counts = {}
    for key, p in pins.items():
        counts[p["set_key"]] = counts.get(p["set_key"], 0) + 1
    for key, p in pins.items():
        exp = _v(sets.get(p["set_key"], {}).get("fields", {}), "expected_pin_count") if sets.get(p["set_key"]) else ""
        if isinstance(exp, (int, float)) and exp > 0 and counts[p["set_key"]] > exp:
            p["review_reasons"].append(f"grouping: {counts[p['set_key']]} pins recorded but the set states {int(exp)}; check for split or extra pins")
    # A person who compared both listings can record "distinct: not the same pin as <key>"; that
    # clears the cross-set flag for that pair only (the finding stays in the evidence trail).
    distinct = {(nf.get("key"), str(nf.get("note", "")).strip()[len("distinct: not the same pin as"):].strip())
                for nf in store.not_found if str(nf.get("note", "")).strip().lower().startswith("distinct: not the same pin as")}
    for key, other in cross_set_suspects(pins, sets).items():
        if (key, other) in distinct or (other, key) in distinct:
            continue
        pins[key]["review_reasons"].append(f"possible cross-set duplicate of {other}")
    seed_notes = {k: seed_note(cat, _v(s["fields"], "set_name") or k.split("/")[0].replace("-", " ")) for k, s in sets.items() if not s["parent"]}
    rows = write_outputs(out_dir, store, pins, sets, dupes, seed_notes)
    return store, pins, sets, dupes, rows


def main():
    ap = argparse.ArgumentParser(description="PinHunt catalogue research engine (offline prototype)")
    ap.add_argument("packets", nargs="+", help="evidence packet JSON files / globs")
    ap.add_argument("--out", default="out")
    a = ap.parse_args()
    store, pins, sets, dupes, rows = run(a.packets, a.out)
    print(f"claims accepted {len(store.claims)}, rejected {len(store.rejected)}; pins {len(pins)}; sets {len(sets)}")
    print(f"needs review {sum(1 for r in rows if r['review_status'] == 'NEEDS REVIEW')} / {len(rows)}; outputs in {a.out}/")


if __name__ == "__main__":
    main()
