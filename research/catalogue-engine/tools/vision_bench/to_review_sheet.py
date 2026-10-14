"""Turn one or two vision extractions of the maintainer's own photos into a review sheet.

Usage: python3 to_review_sheet.py <out.xlsx> <extract_A.json> [<extract_B.json>]
One row per extracted pin. When a second independent extraction is given, rows where the two
readers disagree are marked "CHECK FIRST". The reviewer fills "Correct? (Y/N)" and "Correction".
Extraction never verifies anything: the person checking the photo does.
"""
import json, sys
import pandas as pd

FIELDS = ("subject", "edition_type", "edition_size", "price_eur")


def load(path):
    return {p["file"]: p for p in json.load(open(path))["posters"]}


def norm(v):
    return " ".join(str(v).lower().split()) if v is not None else ""


def rows(a, b=None):
    out = []
    for f, pa in a.items():
        pb = {p["position"]: p for p in (b or {}).get(f, {}).get("pins", [])}
        for p in pa.get("pins", []):
            q = pb.get(p["position"])
            diff = [k for k in FIELDS if q is not None and norm(p.get(k)) != norm(q.get(k))]
            if b is not None and q is None:
                diff = ["missing in second reading"]
            out.append({
                "Photo": f, "Poster title": pa.get("title"), "Poster date": pa.get("date"), "Position": p["position"],
                **{k.replace("_", " ").capitalize(): p.get(k) for k in FIELDS},
                "Readers disagree on": ", ".join(diff),
                "Priority": "CHECK FIRST" if diff else "",
                "Uncertain (reader)": "; ".join(str(u) for u in pa.get("uncertain", [])),
                "Correct? (Y/N)": "", "Correction": "",
            })
    return out


if __name__ == "__main__":
    out, a = sys.argv[1], load(sys.argv[2])
    b = load(sys.argv[3]) if len(sys.argv) > 3 else None
    df = pd.DataFrame(rows(a, b)).sort_values(["Priority", "Photo", "Position"], ascending=[False, True, True])
    df.to_excel(out, index=False, sheet_name="Review")
    print(f"{len(df)} rows, {int((df['Priority'] == 'CHECK FIRST').sum())} to check first -> {out}")
