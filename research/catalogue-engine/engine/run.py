"""Pipeline entry point."""
import argparse
import pathlib
from .load import load_packets
from .reconcile import reconcile
from .dedupe import Catalogue, match_pin, seed_note
from .export import write_outputs, _set_chain, _from_chain, _v

ROOT = pathlib.Path(__file__).resolve().parents[3]
TRUSTED = ROOT / "attached_assets/PinHunt_UK_Trusted_Test_Catalogue_1785531320477.xlsx"
SEED = ROOT / "attached_assets/PinHunt_UK_Master_Seed_13000_Pins_Character_Enriched_1785155236773.xlsx"


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
        # internal duplicates: same set + same character set inside this run
        sig = (p["set_key"], tuple(sorted(c.lower() for c in chars)))
        if chars and sig in seen:
            p["review_reasons"].append(f"possible internal duplicate of {seen[sig]}")
        seen.setdefault(sig, key)
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
