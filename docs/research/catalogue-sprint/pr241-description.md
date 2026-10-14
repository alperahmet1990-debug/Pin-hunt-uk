## Linked issue
Closes #241

Audit IDs: none (follows #237 / PR #250, import design and dry run). Started interactively in the catalogue sprint session at the maintainer's request ("Take #241"); claim on #241.

## Summary of changes
- **`POST /api/admin/research/import`** (`src/routes/research-import.ts`): App Creator only, at most 50 candidates.
  - **All or nothing.** The batch is re-judged with the dry-run rules. If any candidate is ineligible, the response is **409** and nothing is written.
  - **For an eligible batch:**
    - an `import_batches` row is created (`running`)
    - `pinhunt_id`s are minted with `next_pinhunt_id()` (migration 045)
    - **new** `pins` rows are inserted as `needs_source_verification`, `is_seed_record`, `needs_review`, with `import_batch_id`, so they are **not public**
    - each candidate moves `approved → imported` with `imported_pin_id` / `import_batch_id`, status-guarded
    - the batch is marked `completed`
  - **On any failure after the batch row exists**, the import compensates:
    - candidates reset to `approved`
    - the batch's new pins are deleted
    - the batch is marked `failed` with an error report
  - **It never updates an existing pin.**
- **`src/lib/research-import.ts`**:
  - Batch judging is shared by the dry run and the import (`judgeBatch`, `parseCandidateIds`).
  - New refusal `unresolved_conflict`: any `conflict:` review reason, including review holds.
  - `collection` maps from `Collection name` / `Series`. It previously fell back to `Categories`.
  - `catalogue_source` is null. It references `catalogue_sources(id)` and no research source row exists, so the design's `research_import` value would have failed the insert. Provenance is the import batch plus `catalogue_candidates.imported_pin_id`.
  - `release_date` stores full dates only. The column is `DATE`, and month-only research dates would fail the insert. The year stays in `release_year`.
- **Dry run:** same behaviour, now through the shared judging code.

## Acceptance criteria
- [x] **Only approved, directly verified, non-duplicate candidates are imported; each import creates a new pin and never updates an existing one.**
  - "imports eligible candidates as NEW, non-public pins and links each candidate": the existing pin is unchanged.
  - "refuses the whole batch when any candidate is ineligible, and writes nothing".
  - "refuses a candidate whose title and collection already exist in the live catalogue".
  - "refuses a candidate with an unresolved conflict…".
- [x] **Imported pins are not visible to app users:** `verification_status = needs_source_verification`, asserted in the test above and in the offline replay ("imported pins are not public").
- [x] **Each candidate is marked `imported` and linked to its pin and batch:** asserted in the test above and in the offline replay (93/93 linked).
- [x] **Any error leaves no pins and no candidate changes from that batch:** tests "leaves no new pins and no imported candidates when the pin insert fails / minting an id fails / a candidate update fails part-way", and "fails the batch, without overwriting, when a candidate changes during the import".
- [x] **App Creator only:** "401 without a token or with a bad one, 403 for non-creators, and writes nothing".

## Tests
- **New:** `src/routes/research-import.write.test.ts`, 11 tests against a stateful in-memory Supabase fake (inserts, updates, deletes, rpc). Existing dry-run tests unchanged and passing.
- **API suite:** `npx vitest run` in `artifacts/api-server`: 13 files, **383 passed**.
- **Offline replay against the real schema** (`research/catalogue-engine/tools/offline_import_test.mjs` on branch `claude/catalogue-research-sprint1`):
  - PGlite replays migrations 002–045, with 53/54 applying; `006_trade_ratings` is a pre-existing unrelated failure.
  - It loads the 100-pin DSUK pilot run, simulates direct checks and approvals under the real `checkDecision`, and then runs this PR's `judgeCandidate` / `buildPinRow` and the same writes.
  - **Result:** **93 created**, 7 refused (4 flagged duplicates, 2 without an evidenced release year, 1 without a character).
  - PASS: not public; every candidate linked; unique PHUK ids; the `imported`-without-pin constraint is enforced.
  - The replay found the `release_date` DATE issue fixed above.

## Regression checks
- `pnpm run typecheck:libs` and the API typecheck: pass.
- The dry run keeps its contract (`dryRun`, `wouldCreate`, `refused`) and existing tests.
- No change to Research Review routes, approval rules, migrations or RLS.

## Screenshots
N/A (no UI change)

## Limitations
- **No database transaction.** Supabase JS has none here, so atomicity comes from validate-first plus compensation on failure. If compensation itself fails, the batch row stays `running` for manual cleanup by `import_batch_id` (design §7).
- **The fake is not a database.** RLS and grants were not exercised against a real Supabase project. The real-schema replay ran as a superuser on PGlite. The service role's execute right on `next_pinhunt_id()` relies on Supabase's default function grants. Check it on staging.
- **Month-only release dates** are not stored on `pins` (null), by design.

## Risk and rollback
- **L2, medium:** it writes catalogue rows, but only on staging and only as non-public seed records. No migration. App Creator only. All or nothing.
- **Rollback:** revert the PR. To remove imported data, delete pins by `import_batch_id` and reset the batch's candidates (design §7).

## Human steps required
- **Staging only, after migration 045 and the pilot review:**
  1. run the dry run on the approved pilot ids
  2. run the import on the same ids
  3. confirm the new pins are not visible in the app

  See `docs/research/catalogue-sprint/LAPTOP-CHECKLIST.md` §6 on the sprint branch.
- **Production:** not approved. A separate decision.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01EJKpUzadfBGAwYjvdRwUui
