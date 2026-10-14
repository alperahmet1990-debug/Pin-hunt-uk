# Blind accuracy audit of research candidates (2026-10-14)

## Method
- **Sample:** a random, stratified set of 16 releases (DLP 5, DSUK 4, WDW 4, DLR 3) holding 66 of our candidate pins.
- **Blind re-research:** an independent agent researched each release from scratch, without access to our records (36 searches, search summaries only). It was given only the set name, place and date.
- **Comparison:** each of our pins was then judged by hand against the blind result.
- **Limits:** search summaries on both sides, so this measures *agreement between independent snippet research*, not truth. The sample is small; treat the numbers as indicative.

## Result (15 resolved releases, 60 of our pins; Magic of Disney could not be resolved blind)
| Outcome | Pins | Share |
|---|---|---|
| Confirmed by the blind check | 50 | 83% |
| Wrong or mis-structured (combined vs separate characters, wrong subjects) | 5 | 8% |
| Not confirmed (blind check found nothing either way) | 5 | 8% |

**Where the errors are**
- **Pin structure, not identity.**
  - **DLP Pajama Party:** "Mickey & Minnie" is one pin, but we hold two records (Mickey, Minnie).
  - **DLP Tangled June LEs:** the blind check found Rapunzel / Flynn / Pascal. We hold "Rapunzel and Flynn", "Maximus and Pascal" and an unclear third record.
- **Low-confidence, fan-only DLP sets.** All 5 errors and 3 of the 5 unconfirmed pins are in DLP or Low-confidence records.
- **One High-confidence pin unconfirmed** (DSUK Magical Medallions "Big Hero 6"). The blind check found only Meet the Robinsons for January 2024.

**Completeness (pins the blind check found that we lack)**
- WDW festivals are badly under-covered. Food & Wine 2024 has 19 pins found blind against our 2; Flower & Garden 2024 has 10 against our 2.
- Also missing: Pixar gummy (2 more), Moana puzzle (Te Ka, Kakamora, 2 chasers) and Walt's Magical Moments releases 1–2.

**Agreement on contradictions:** the blind check also found the Valentine's "Stitch & Angel vs Lilo & Angel" disagreement. That confirms the engine was right to block it.

## What it means
1. **Approval must stay per pin, with a person checking the page.** About 1 in 6 snippet-based candidates is wrong or unconfirmed.
2. **Check pin structure explicitly.** For multi-character pins, the reviewer must confirm "one pin with A & B" vs "two pins". The pilot checklist and Research Review guidance now say so.
   - Proposed engine flag: `structure: verify combined/separate` on pins whose characters are split from, or merged with, a sibling in the same set.
3. **DSUK is the right place to start, with care.**
   - The sampled DSUK sets with stated counts matched the blind check: Celebrating Disney Pins series 4 (3/3) and the Moana puzzle (8/8 of ours).
   - One sampled High-confidence pin was not confirmed (Big Hero 6). Even "High" must be checked on the page.
4. **Coverage, not accuracy, is the bigger gap for WDW.** Festival releases have 10–20 designs, and snippet research captures only a few. A permitted page read of one round-up post would close most of it.
