# Pilot: 28 new candidates (prepared, NOT imported)

**Files:** `pilot_28_candidates.xlsx` (checklist + candidates) and `pilot_28_candidates.csv` (same data).

**Which pins:** engine-verified (identity High/Medium, no blocking conflict) **and** not already in the live catalogue.

| Set | Pins | Identity | Notes |
|---|---|---|---|
| Brush of Magic Mystery Series 3 (Disney Store, 1 Sep 2026) | 10 | High | Complete set. UK + US listings. Confirm which "Louis". |
| Brush of Magic LE singles (Disney Store, Jan–Oct 2026) | 12 | 4 High / 8 Medium | Date variants on Hades, Gadget, Maleficent. Jumbo piece count to confirm. |
| Windows of Attraction 2026 #8–#10 (WDW) | 3 | Medium | Joins the existing trusted set (10/12 known). Tiki Room was due 13 Oct; confirm it actually released. |
| Disney Classics London (Disney Store UK) | 3 | Medium | Official UK listing only. Release date and edition type unknown and must stay unknown. Price seen as £20 and as £25. |

**Excluded from the pilot:**
- Animated Cuties S2 (8) and Brush of Magic Mystery S2 (10): one fan blog only.
- 4 LE pins with edition-size conflicts: Aladdin, Cinderella, Darkwing Duck, Hercules.
- Ariel and Captain Hook.
- The 20 verified duplicates: they become *enrichment* suggestions later, not pilot imports.

## Pilot steps

**Before any step below:** the ID-reuse impact queries have been run (README §1), and approvals A–C are granted.

1. **Direct verification.** A human works through `pilot_28_candidates.xlsx`.
   - Open each official or news URL and complete checks 1–4.
   - Record unknowns as unknown.
   - Target: **≤ 3 minutes per pin**. This measures the real cost per pin.
2. **Optional live-fetch re-run.** If network access is approved, re-run the research for these 4 sets with `page_fetch`. Compare with the snippet-based values; the difference is the snippet error rate.
3. **Staging only.** Apply proposed migration 045 to **staging**. Load the pilot run with the dry-run loader. Approve in the admin screen. Import to **staging**. Smoke-test search, set browse, add to collection, For Trade / ISO, and scan candidates.
4. **Production.** Only after step 3 passes and with the maintainer's go-ahead, repeat the import on production. That is one `import_batches` batch, rollback-ready.

**Success criteria:**
- 28/28 decided.
- 0 ID collisions.
- 0 values without evidence.
- Snippet-vs-page disagreement rate measured.
- Median verification time per pin recorded.
- Rollback rehearsed on staging.
