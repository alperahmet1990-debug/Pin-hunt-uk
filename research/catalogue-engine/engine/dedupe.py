"""Duplicate detection against the existing Master Catalogue workbooks (read-only)."""
import re
from difflib import SequenceMatcher
import pandas as pd
from .normalize import norm_key, norm_character

STOP = set("the and of a series collection mystery pin pins set disney parks store limited edition release open "
           "2024 2025 2026 wdw dlr walt world resort".split())


def toks(s):
    return {t for t in norm_key(s).split() if t not in STOP and len(t) > 1}


def series_no(s):
    m = re.search(r"series\s*(\d+)", str(s).lower())
    return m.group(1) if m else None


def _s(v):
    return "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)


class Catalogue:
    def __init__(self, trusted_xlsx, seed_xlsx=None):
        t = pd.read_excel(trusted_xlsx, sheet_name="Master Catalogue")
        self.rows = []
        for _, r in t.iterrows():
            chars = {norm_key(norm_character(c)) for c in re.split(r"[;,]", _s(r.get("All characters")) + ";" + _s(r.get("Main character")) + ";" + _s(r.get("Characters"))) if c.strip()}
            self.rows.append(dict(pinhunt_id=r["pinhunt_id"], title=_s(r["Pin name"]), series=_s(r["Series"]),
                                  chars=chars, codes=set(re.findall(r"\d{9,15}", _s(r.get("external_ids")) + " " + _s(r.get("Notes")))),
                                  stoks=toks(r["Series"]), ntoks=toks(r["Pin name"]) - toks(r["Series"])))
        self.seed = []
        if seed_xlsx:
            s = pd.read_excel(seed_xlsx, sheet_name="Master Catalogue", usecols=["pinhunt_id", "Pin name", "Series"])
            self.seed = [dict(pinhunt_id=r["pinhunt_id"], title=_s(r["Pin name"]), stoks=toks(r["Series"])) for _, r in s.iterrows()]


def match_pin(cat: Catalogue, family: str, subset: str, chars, name: str, codes):
    """→ (status, existing pinhunt_id or '', basis)"""
    ftoks = toks(family)
    want = {norm_key(norm_character(c)) for c in (chars or [])}
    sno = series_no(subset)
    fam_rows = [r for r in cat.rows if ftoks and ftoks <= r["stoks"]]
    for r in cat.rows:
        if codes and codes & r["codes"]:
            return "DUPLICATE", r["pinhunt_id"], f"product code {sorted(codes & r['codes'])[0]}"
    same_subset = [r for r in fam_rows if series_no(r["series"]) == sno or (sno is None or series_no(r["series"]) is None)]
    ntoks = toks(name) - ftoks
    for r in same_subset:
        if want and want & r["chars"]:
            return "DUPLICATE", r["pinhunt_id"], f"same set family '{r['series']}' + character"
        if ntoks and r["ntoks"] and len(ntoks & r["ntoks"]) / len(ntoks | r["ntoks"]) >= 0.5:
            return "DUPLICATE", r["pinhunt_id"], f"same set family '{r['series']}' + pin name tokens"
    for r in same_subset:
        for w in want:
            for c in r["chars"]:
                if SequenceMatcher(None, w, c).ratio() >= 0.8:
                    return "PROBABLE DUPLICATE", r["pinhunt_id"], f"same set, character spelled '{c}' vs '{w}' — review"
    if same_subset:
        return "NEW (existing set has other pins)", "", f"set '{same_subset[0]['series']}' exists; this design is not in it"
    if fam_rows:
        return "NEW (family exists, different sub-set)", "", f"family matches '{fam_rows[0]['series']}' but different series number"
    other = [r for r in cat.rows if want and want & r["chars"]]
    if other:
        return "NEW", "", f"character also in other sets ({len(other)}), not a duplicate"
    return "NEW", "", ""


def seed_note(cat: Catalogue, family: str):
    ft = toks(family)
    n = sum(1 for r in cat.seed if ft and ft <= r["stoks"])
    return f"{n} archived speculative seed rows share this family name (ignored)" if n else ""
