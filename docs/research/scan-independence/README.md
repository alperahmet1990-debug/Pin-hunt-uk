# AI Pin Scanning Without Pin & Pop — Assessment & Test Design (Oct 2026)

**Status:** research only. No app, database, scan pipeline or agent workflow was changed.
- **Arm A** (metadata-only) was **run offline** against our real catalogue files.
- **Arms B and C** are **designed but not run.** This environment has no OpenAI, Google Vision or Supabase credentials, and PinHunt has no photo test set of physical pins yet.

**Files in this folder**

| File | What it is |
|---|---|
| `arm_a_metadata_eval.py` | Offline Arm A evaluator. Reads `attached_assets/*.xlsx` and the POC workbook. No credentials needed. |
| `arm_a_results.csv`, `arm_a_per_pin_U0.csv` | Arm A results. |
| `test_manifest.csv` | 99 representative test cases for the live run (Arms A–C), grouped. |

---

## 1. How scanning works today (`artifacts/api-server/src/routes/scan.ts`)

| Stage | What happens | External dependency |
|---|---|---|
| 1 Describe | An OpenAI vision call (`OPENAI_SCAN_MODEL`, default `gpt-5.6-luna`, high-detail image) returns `{characters[], keywords[]}`. **In parallel**, Google Vision runs `TEXT_DETECTION`, `LOGO_DETECTION` and **`WEB_DETECTION`**. | OpenAI; Google Vision. **`WEB_DETECTION` is a reverse-image search of the public web.** |
| 2 Search + rank | Up to 18 *sequential* `searchPins` calls (character filter, then title/collection/alias terms incl. OCR/web terms) build ≤350 candidates. A second vision call ranks them using the photo plus a text list. Google web guesses are injected as "strong hints". | OpenAI; Supabase (trusted catalogue, `verified AND is_searchable`). |
| 3 Visual verify | Same-collection siblings are added. If any candidate has `pins.image_url`, a third vision call compares the user photo with up to 6 reference images (low detail) and re-ranks. | Reference images in `pins.image_url`: eBay-backfilled listing photos, Collectible PinTrader imports, collector contributions. |
| Response | **Top 3 only** with self-reported confidence. The app labels ≥75 "Strong", ≥50 "Possible" and below 50 "Weak". | — |

**Does it depend on Pin & Pop today?**
- **Images: no.** Pin & Pop images live only in `pin_images` with `public_display_allowed = false` (migration 042, admin-only). The scan reads `pins.image_url` using the anon key, so it never sees them.
- **Data: yes, indirectly.** The 182-pin trusted catalogue the scan searches is 100% Pin & Pop-sourced (see `../independent-catalogue-poc/`).
- **Reverse-image: yes, already.** Google `WEB_DETECTION` is reverse-image search. Its guesses very likely surface pages from pin databases and eBay, and they are fed into ranking as "strong hints". Stage 3 is also image-to-image comparison, using reference images of mixed provenance (eBay photos have no display rights).

**Weaknesses found in the code (not changed)**
1. **No real "not in catalogue" outcome.**
   - The rank prompt must always return entries.
   - An empty search falls back to 300 arbitrary pins.
   - So an unknown pin still gets 3 suggestions, and a wrong pin can be labelled "Strong" if the model is over-confident.
2. **Confidence is LLM self-reported and uncalibrated.**
3. **The user never sees ranks 4–5,** although the model returns 5.
4. **Latency:** catalogue searches run one after another (up to 18 round trips) before two or three sequential vision calls.
5. **Stale prompt:** the rank prompt mentions Loungefly/BoxLunch, but the live catalogue is Disney Parks/Store only.
6. **No visual vocabulary in the catalogue.** It holds names, series, characters and edition only. Nothing records colour, pose, object or printed text, which is what tells sibling pins apart. This matches `.agents/memory/ai-model-quirks.md`: "Text metadata alone cannot distinguish sibling pins".

## 2. Test design: three arms

All arms use the **same photos**, the **same catalogue snapshot** and the **same scoring**. They are run read-only against a staging catalogue export.

| Arm | Pipeline under test | Excluded |
|---|---|---|
| **A. Metadata-only** | Photo → structured attributes (character, object/theme, printed text) → deterministic search and score over catalogue fields. Live: the attributes come from a vision model. Offline (this run): the attributes are an **oracle**, i.e. perfectly extracted from the catalogue itself, giving an upper bound. | Reference images, Google `WEB_DETECTION`, LLM ranking |
| **B. AI visual description + structured search** | Stage 1 describe (vision model, extended to output colours, object, pose, visible text and backstamp text) → catalogue search → stage 2 LLM rank with photo + candidate metadata. Equivalent to today's pipeline with **stage 3 and `WEB_DETECTION` switched off** (the harness reimplements it; the app is not changed). OCR (`TEXT_DETECTION`) is allowed in variant B2 only. | Reference images, reverse-image search |
| **C. Own-image vector benchmark (future)** | Embed the user photo (e.g. CLIP/SigLIP-class image encoder) → nearest neighbours among embeddings of **PinHunt-approved images only**: collector contributions with consent, then optionally Collectible PinTrader images reported as a separate condition → optional LLM re-rank of the top 10. | Pin & Pop, eBay, web images |

**Test set: `test_manifest.csv`, 99 cases × 2 photos**
- P1: clean front on a plain background.
- P2: real-world (in hand or on a lanyard, angled).

| Group | Cases | Purpose |
|---|---|---|
| 1 Similar-looking siblings | 21 | Princess Pastries macarons, Ducks of Disney, Windows of Attraction frames |
| 2 Same character, different sets | 26 | Mickey in 10 sets; Peter Pan, Pinocchio, Stitch, Goofy across sets |
| 3 Mystery / blind box | 18 | Animated Cuties S1, Brush of Magic Mystery S1 |
| 4 Limited edition | 7 | Enchanted Doors LE 2,500 (backstamp edition text) |
| 5 Unknown (not in catalogue) | 21 | Animated Cuties S2, Brush of Magic S2/LE, Windows of Attraction #8–10. These are siblings of catalogued pins, so they are the hardest case. |
| 6 Negative / robustness | 6 | Non-Disney pin, non-pin merchandise, fake/"scrapper" pin, blur, lanyard, backstamp only |

Photos must be **taken by PinHunt or contributed with consent**, never downloaded. Physical pins are needed for groups 1–5. Contributed photos from the existing `contribute` flow can be reused.

**Metrics** (per arm, per group, P1 and P2 separately)
- **Top-1 / Top-5 accuracy:** correct pin at rank 1 / within ranks 1–5 (known pins only).
- **False positive rate:** share of scans where the top result is shown as "Strong" (≥75, or the arm's accept threshold) but is the wrong pin. Measured over known and unknown pins.
- **Unknown-pin detection:** share of group 5–6 scans where no result reaches the accept threshold.
- **Latency:** server-side p50/p95, wall clock, measured per stage.
- **Cost per scan:** recorded input/output/reasoning tokens × contract price, plus Google Vision units.
- **Calibration:** reliability curve of reported confidence vs actual correctness. It is used to set the "Strong" threshold.

**Procedure**
1. Freeze a catalogue snapshot (staging export).
2. Run each photo through A, B, B2 and C with fixed model settings, 3 repeats for the LLM arms.
3. Log every stage's output to a results CSV.
4. Score blind against `test_manifest.csv`.
5. Bootstrap 95% confidence intervals. About 200 photos gives roughly ±6 points on top-1 accuracy.

**Suggested launch gates for Arm B**
- **Accuracy:** top-5 ≥ 90% and top-1 ≥ 70% on groups 1–4.
- **False positives:** "Strong"-labelled false positives ≤ 5%.
- **Unknown pins:** unknown-pin detection ≥ 80% on groups 5–6.
- **Latency:** p95 ≤ 12 s.

## 3. Arm A results (run offline, oracle attributes = upper bound)

**Catalogue universes tested**
- **U0:** the live trusted catalogue (182 pins).
- **U1:** U0 plus the 49 researched gap pins (231).
- **U2:** U1 plus the 13k archived seed, a scale stress test. Seed names are synthetic, but collisions are realistically dense.

**Observation levels**
- **O1:** character only.
- **O2:** O1 plus visible object/theme words that our `Categories` field happens to hold.
- **O3:** O2 plus series text read off the pin. This is optimistic, because mystery pins rarely print it.

| Universe | Observation | Top-1 | Top-5 | Wrong top match (false positive) | Unknown detected |
|---|---|---|---|---|---|
| U0 (182) | O1 character only | 60.9% | 93.8% | 39.1% | 42.9% (49 unknowns) |
| U0 | O2 + visible theme | 89.7% | 98.3% | 10.3% | 42.9% |
| U0 | O3 + series text | 99.5% | 100% | 0.5% | 12.2% |
| U0 | O1, pins sharing a character (93) | 26.3% | 87.9% | 73.7% | — |
| U1 (231) | O2 | 90.7% | 98.1% | 9.3% | — |
| U2 (13k+) | O1 | 31.1% | 52.9% | 68.9% | — |
| U2 | O2 | 70.0% | 88.6% | 30.0% | — |
| U2 | O3 | 82.8% | 100% | 17.2% | — |

**What this shows**
- **Character alone is not enough.** Mickey, Minnie, Goofy, Donald and Pluto tie 5–10 ways across mystery sets (see `arm_a_per_pin_U0.csv`). Today's catalogue is tiny, which is why top-5 still looks good. At realistic catalogue size, top-1 with characters only falls to about 30%.
- **The lever is visual vocabulary in the catalogue.** Adding a few visible-theme words (duck, macaron, ice-cream bar, fan) lifts top-1 from 61% to 90%. The remaining failures are sets whose `Categories` carry no visual descriptor at all, e.g. "Wishables *Shimmer*" and "Food & Wine" Mickey/Minnie/Goofy.
- **Metadata cannot tell an unknown pin from a known one.** 57% of not-in-catalogue pins are confidently matched to a wrong pin even with perfect attributes. For example, Brush of Magic S2 Pinocchio is matched to Animated Cuties Pinocchio. Reading series text makes this *worse* (88% wrong), because the Brush of Magic S2 name matches Brush of Magic S1.
- **Limited editions behave well** (97–100% top-1). Distinct scenes plus edition and backstamp text separate them.
- **Real-world numbers will be lower.** These are upper bounds; a live Arm A adds the vision model's own character-recognition errors. Themed objects with no face are the known weak spot, e.g. Princess Pastries.

## 4. Latency and cost model (estimates; confirm in the live run)

Token sizes come from this code and catalogue. A candidate line averages about 45 tokens, so the rank prompt is about 8k tokens with today's 182-pin catalogue and about 16k at the 350-candidate cap.

| | A (live) | B | B2 (+OCR) | Today (B + web detection + verify) | C |
|---|---|---|---|---|---|
| Vision/LLM calls | 1 | 2 | 2 | 3 | 0–1 (optional re-rank) |
| Input tokens / scan | ~1–1.5k | ~3–18k | ~3–18k | ~4–20k | ~0 (+~2k if re-ranked) |
| Output + reasoning tokens | ≤2k | ≤3k | ≤3k | ≤4k | ≤1k |
| Google Vision units | 0 | 0 | 1 (text) | 3 (text, logo, web) | 0 |
| Expected latency | 2–6 s | 5–15 s | 5–15 s | 8–25 s | <1 s embed + search; +3–6 s if re-ranked |
| Main cost driver | describe call | rank prompt size | rank prompt + OCR | 3 calls + web detection | encoder hosting / embedding API |

- **Cost per scan** = Σ(tokens × the contract price for `OPENAI_SCAN_MODEL`) + Google Vision units × the unit price.
- At Google's list prices as last known (about $1.50 per 1,000 for text or logo, about $3.50 per 1,000 for web detection; verify current pricing), **today's Vision add-on is about $0.0065/scan**. B2 costs about $0.0015 for Vision and B nothing.
- **The biggest cost lever in B is the candidate cap.** Cutting 350 candidates to about 60 well-filtered ones cuts rank-prompt input by about 80%.
- **Arm C** runs on pgvector, which Supabase supports. The marginal cost per scan is near zero once the images are embedded.

## 5. Conclusions

**What works today**
- The two-stage "describe → search → rank" design is sound and needs no Pin & Pop images.
- Limited-edition and scene pins with distinct characters are well separated by metadata.
- The app already has a "Can't find it? Add this pin yourself" path and a contribution flow. That flow is the seed of an own-image library.

**What needs improving before an independent launch** (proposals; nothing changed)
1. **Turn off reverse-image dependence.** Put Google `WEB_DETECTION` behind a flag (off or log-only), and stop using eBay-sourced images as stage-3 references. Keep OCR, because it reads *our* pin and is not a lookup of others' pages.
2. **Add per-pin visual descriptors to the Master Catalogue:** dominant colours, object or form (duck, macaron, window, door), pose and props, printed front text, and backstamp text. Write them from PinHunt-owned or contributed photos. This is the single biggest lever for Arms A and B (Arm A O1→O2: +29 points top-1).
3. **Add a real "not in catalogue" outcome.**
   - Remove the 300-pin fallback.
   - Let the ranker return "none".
   - Set the "Strong" threshold from the calibration curve, not at a fixed 75.
   - Route unknowns into the existing add-a-pin flow. They become catalogue leads.
4. **Show top 5 and let the user confirm.** Each confirmed pick (with consent) becomes labelled training and evaluation data, and a reference photo for Arm C.
5. **Efficiency:**
   - Parallelise the catalogue searches.
   - Cap candidates at about 60–100 after scoring.
   - Update the rank prompt to the real catalogue scope.
6. **Build Arm C gradually.** Embed approved contributed images in pgvector as they arrive. Report C against B on the same test set each quarter; switch the default when C beats B on top-1 for sibling groups.

**Can we launch AI pin recognition independently of Pin & Pop?**
- **Launchable now:** an *assisted* scan (top-5 suggestions, user confirms, "not in catalogue" path) using Arm B, i.e. vision description plus our own metadata, with no Pin & Pop images and no reverse-image search. This is viable at today's catalogue size, *provided* the live Arm B run meets the gates above. Arm A's upper bound (98% top-5 with visual-theme words) suggests top-5 is attainable. Top-1 on mystery siblings and unknown-pin rejection are the risks.
- **Not yet launchable:** *automatic* single-answer identification of mystery siblings or same-character variants, and reliable "this pin isn't in our catalogue" detection. Both need visual information we don't store yet: descriptors (step 2) and then our own reference images (Arm C).
- **The bigger dependency is the catalogue, not the images.** The scan searches a 100% Pin & Pop-sourced catalogue, so true independence also requires the independent catalogue work in `../independent-catalogue-poc/`.

**To run B and C (next steps, for approval)**
1. Provide staging credentials to a research session: OpenAI and Google Vision keys plus a read-only Supabase staging snapshot.
2. Photograph the 99 manifest cases (about 200 photos) from physical pins or consented contributions.
3. Build a standalone harness under `docs/research/` that reimplements Arms B, B2 and C *outside* the app and logs tokens and latency per stage.
4. Report results against the gates, then decide on the visual-descriptor schema and the "not in catalogue" UX.
