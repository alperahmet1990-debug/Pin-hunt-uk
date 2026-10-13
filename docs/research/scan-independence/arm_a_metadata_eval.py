"""
Arm A — metadata-only pin matching, offline evaluation (read-only).

Reads the catalogue workbooks in attached_assets/ and the research POC
workbook; touches no database, API or app code. No credentials needed.

It answers: if a vision model described a photographed pin PERFECTLY in the
vocabulary our catalogue stores (characters, object/theme words, series
text), how often would a metadata search put the right pin at #1 / in the
top 5, and how often would it confidently return a wrong pin for a pin we
don't have?  Results are therefore an UPPER BOUND for metadata matching.

Run:  python3 docs/research/scan-independence/arm_a_metadata_eval.py
"""
import re, json, collections, sys, pathlib
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[3]
AA = ROOT / "attached_assets"
POC = ROOT / "docs/research/independent-catalogue-poc/PinHunt_Independent_Catalogue_POC_2026.xlsx"
OUT = pathlib.Path(__file__).resolve().parent

def s(v):
    return "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)
def toks(t):
    return {w for w in re.sub(r"[^a-z0-9]+", " ", s(t).lower()).split() if len(w) > 2}
STOP = toks("the and series collection mystery pin pins disney parks walt world resort store limited edition release open 2024 2025 2026 wdw dlr")
def chars_of(*vals):
    out = set()
    for v in vals:
        for c in re.split(r"[;,]", s(v)):
            c = re.sub(r"\(.*?\)", "", c).strip().lower()
            if c and c not in ("unknown", "various", "unverified"):
                out.add(c)
    return out

# Words in our Categories field that a camera could actually see on a pin.
VISUAL = {"food", "puzzle", "rubber duck", "ice cream bar", "folding fan", "pastry", "macaron",
          "framed portrait", "toy", "box", "attraction", "art", "windows of attraction",
          "enchanted doors", "spaceship earth", "christmas"}

# ── catalogue rows → uniform records ─────────────────────────────────────────
def from_trusted(df):
    recs = []
    for _, r in df.iterrows():
        cats = [c.strip().lower() for c in s(r["Categories"]).split(";") if c.strip()]
        recs.append(dict(
            id=r["pinhunt_id"], title=s(r["Pin name"]), series=s(r["Series"]),
            chars=chars_of(r["Main character"], r["All characters"], r["Characters"]) or chars_of(r["Main subject"]),
            visual={c for c in cats if c in VISUAL},
            edition=s(r["Edition type"]), le=s(r["Edition size"]),
            text=toks(" ".join([s(r["Pin name"]), s(r["Series"]), s(r.get("Search aliases")), s(r["Categories"])])) - STOP,
            origin="trusted"))
    return recs

POC_VISUAL = {"Animated Cuties": {"chibi", "cute"}, "Brush of Magic": {"art", "paintbrush", "sketch"},
              "Windows of Attraction": {"attraction", "windows of attraction", "stained glass"}}
def from_poc(df):
    recs = []
    for _, r in df.iterrows():
        attraction = s(r["film_or_attraction"]) if r["parent_set"] == "Windows of Attraction" else ""
        chars = chars_of(r["all_characters"]) or chars_of(attraction.split(" - ")[0])
        recs.append(dict(
            id=r["research_id"], title=s(r["pin_name"]), series=f'{r["parent_set"]} {r["sub_series"]}',
            chars=chars, visual=set(POC_VISUAL[r["parent_set"]]), edition=s(r["pin_type"]), le=s(r["edition_size"]),
            text=toks(" ".join([s(r["pin_name"]), s(r["parent_set"]), s(r["sub_series"]), attraction])) - STOP,
            origin="poc", trusted_match=s(r["trusted_match"])))
    return recs

def from_seed(df):
    recs = []
    for _, r in df.iterrows():
        cats = [c.strip().lower() for c in s(r["Categories"]).split(";") if c.strip()]
        recs.append(dict(id="SEED-" + r["pinhunt_id"], title=s(r["Pin name"]), series=s(r["Series"]),
            chars=chars_of(re.sub(r"\s*–.*$", "", s(r["Main character"]))), visual={c for c in cats if c in VISUAL},
            edition=s(r["Edition type"]), le=s(r["Edition size"]),
            text=toks(" ".join([s(r["Pin name"]), s(r["Series"]), s(r["Categories"])])) - STOP, origin="seed"))
    return recs

# ── observation levels: what the describer hands to the search ───────────────
def observe(rec, level):
    o = dict(chars=set(rec["chars"]), visual=set(), series_text=set())
    if level >= 2: o["visual"] = set(rec["visual"])
    if level >= 3: o["series_text"] = toks(rec["series"]) - STOP   # e.g. OCR of a printed series name / backstamp
    return o
LEVELS = {1: "O1 character only", 2: "O2 character + visible theme/object", 3: "O3 + series text read off pin (optimistic)"}

def score(obs, cand):
    sc = 0.0
    sc += 3 * len(obs["chars"] & cand["chars"])
    sc += 1 * len(obs["visual"] & (cand["visual"] | cand["text"]))
    sc += 2 * len(obs["series_text"] & cand["text"]) / max(1, len(obs["series_text"]))
    return sc

ACCEPT = 3.0   # need at least a character hit to claim a match

def rank_stats(target_id, obs, universe):
    scored = [(score(obs, c), c["id"]) for c in universe]
    t = next((sc for sc, i in scored if i == target_id), None)
    top = max(sc for sc, _ in scored)
    if t is None:  # target not in catalogue → unknown-pin case
        accepted = top >= ACCEPT
        return dict(top1=0.0, top5=0.0, accepted=accepted, fp=1.0 if accepted else 0.0,
                    tie_group=sum(1 for sc, _ in scored if sc == top) if accepted else 0)
    higher = sum(1 for sc, i in scored if sc > t)
    ties = sum(1 for sc, i in scored if sc == t)           # includes target
    p1 = 1.0 / ties if higher == 0 else 0.0
    p5 = max(0.0, min(1.0, (5 - higher) / ties))
    accepted = top >= ACCEPT
    return dict(top1=p1, top5=p5, accepted=accepted, fp=(1 - p1) if accepted else 0.0, tie_group=ties)

def subset_of(rec):
    tags = []
    e = rec["edition"].lower()
    if "mystery" in e or "mystery" in rec["series"].lower(): tags.append("mystery")
    if "limited edition" in e or rec["le"] not in ("", "nan", "None"): tags.append("limited edition")
    return tags

def main():
    tr = from_trusted(pd.read_excel(AA / "PinHunt_UK_Trusted_Test_Catalogue_1785531320477.xlsx", sheet_name="Master Catalogue"))
    poc_df = pd.read_excel(POC, sheet_name="Pins")
    poc = from_poc(poc_df)
    poc_gaps = [p for p in poc if not p["trusted_match"] or p["trusted_match"] == "nan"]
    seed = from_seed(pd.read_excel(AA / "PinHunt_UK_Master_Seed_13000_Pins_Character_Enriched_1785155236773.xlsx", sheet_name="Master Catalogue"))

    universes = {
        "U0 live trusted catalogue (182)": tr,
        "U1 trusted + 49 researched gaps (231)": tr + poc_gaps,
        "U2 U1 + 13k archived seed (scale stress, synthetic names)": tr + poc_gaps + seed,
    }
    rows, per_pin = [], []
    for uname, U in universes.items():
        known = tr if not uname.startswith("U1") and not uname.startswith("U2") else tr + poc_gaps
        unknown = poc_gaps if uname.startswith("U0") else []
        # pins sharing a character set with another known pin = "similar-looking variants" proxy
        by_char = collections.Counter(frozenset(r["chars"]) for r in known)
        for lvl in (1, 2, 3):
            res = collections.defaultdict(list)
            for rec in known:
                st = rank_stats(rec["id"], observe(rec, lvl), U)
                for tag in ["all"] + subset_of(rec) + (["shares character with another pin"] if by_char[frozenset(rec["chars"])] > 1 else []):
                    res[tag].append(st)
                if uname.startswith("U0"):
                    per_pin.append(dict(universe=uname, level=LEVELS[lvl], id=rec["id"], title=rec["title"], series=rec["series"],
                                        p_top1=round(st["top1"], 3), p_top5=round(st["top5"], 3), tie_group=st["tie_group"]))
            unk = [rank_stats(rec["id"], observe(rec, lvl), U) for rec in unknown]
            for tag, lst in res.items():
                rows.append(dict(universe=uname, level=LEVELS[lvl], subset=tag, n=len(lst),
                                 top1=round(100 * sum(x["top1"] for x in lst) / len(lst), 1),
                                 top5=round(100 * sum(x["top5"] for x in lst) / len(lst), 1),
                                 false_pos_rate=round(100 * sum(x["fp"] for x in lst) / len(lst), 1),
                                 median_tie_group=sorted(x["tie_group"] for x in lst)[len(lst) // 2]))
            if unk:
                rows.append(dict(universe=uname, level=LEVELS[lvl], subset="UNKNOWN pins (not in catalogue)", n=len(unk),
                                 top1=None, top5=None,
                                 false_pos_rate=round(100 * sum(x["fp"] for x in unk) / len(unk), 1),
                                 median_tie_group=None,
                                 unknown_detected=round(100 * sum(1 for x in unk if not x["accepted"]) / len(unk), 1)))
    out = pd.DataFrame(rows)
    out.to_csv(OUT / "arm_a_results.csv", index=False)
    pd.DataFrame(per_pin).to_csv(OUT / "arm_a_per_pin_U0.csv", index=False)
    with pd.option_context("display.width", 250, "display.max_rows", 200):
        print(out.to_string(index=False))

if __name__ == "__main__":
    main()
