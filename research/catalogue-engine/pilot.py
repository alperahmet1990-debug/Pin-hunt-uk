"""Builds the 28-pin pilot staging payload (no import).
Run: python3 pilot.py → ../../docs/research/catalogue-integration/pilot_staging_payload.json"""
import csv
import pathlib
from engine.run import run
from engine.export import write_staging_payload

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parents[1] / "docs/research/catalogue-integration"
keys = {r["research_key"] for r in csv.DictReader(open(OUT / "pilot_28_candidates.csv"))}
store, pins, sets, dupes, rows = run([str(HERE / "evidence/*.json")], str(HERE / "out"))
n = write_staging_payload(str(OUT / "pilot_staging_payload.json"), store, pins, sets, rows, rows[0]["Validated date"], only_keys=keys)
print(f"pilot payload: {n} candidates ({len(keys)} pins + their sets)")
