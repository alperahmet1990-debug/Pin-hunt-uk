# Set-level verification: assessment (not implemented)

Status: proposal only. Nothing here is built. Building it needs its own issue and PR after #229 lands.

## Today (#229)
- Research Review records a direct check **per pin**: `POST /admin/research/candidates/:id/direct-check`.
- The reviewer opens a source, ticks the identity fields they confirmed, and the pin moves to `direct_verified`.
- Each pin is then approved on its own (`/decision`), through `checkDecision` (High/Medium identity, no `conflict:` reasons, a note when there are variant values).
- A 10-pin set therefore needs 10 source opens and 20 actions, even when one official page lists all 10 pins.

## Proposal
**1. Set direct check (one page, many pins)**
- New route `POST /admin/research/sets/:runId/:setKey/direct-check`. Body: `source_url`, `confirmed: [{candidateId, fields[]}]`, `note`.
- The reviewer opens **one** set source (e.g. the DLP release poster or a Disney Store UK set listing). Research Review shows the set's pins as a checklist beside it.
- Pins start **unticked**, and there is no "select all". Each pin the reviewer ticks gets its own `human_direct_check` evidence row (same URL, `checked_by`) and moves to `direct_verified` with the existing status guard.
- Unticked pins stay where they were.

**2. Set approval (batch decision)**
- New route `POST /admin/research/sets/:runId/:setKey/decision`.
- It applies `approve` to every pin in the set that is `direct_verified` **and** passes `checkDecision` on its own.
- Pins that fail (Low identity, conflicts, variants without a note, duplicates) are listed back and stay for individual review.
- The response says exactly which pins moved.

**3. What does not change**
- The approval rules, the evidence model and the identity guard on import.
- The `candidate_approval_is_attributed` constraint: every approved pin still has `direct_verified_by` and `decided_by`.

## Safeguards
- The source must be http(s), pass `checkSourceUrl`, and be either official or a URL already cited for that set. A random page cannot verify a set.
- Cap of 60 pins per call. The set must belong to the run, and every candidate id must belong to that set.
- Probable or exact **duplicates** of existing catalogue pins are excluded from batch approval.
- One audit entry per set action. Per-pin evidence rows keep the trail item by item.

## Schema impact
- None required. Migration 045 already allows `human_direct_check` evidence per candidate.
- Optional later: a `set_check_id` column to group the rows of one set action. That would be additive (a new migration) and is not needed for v1.

## Effort and risk
- About 2 API routes, 1 screen section and tests. That is L2 (no migration), API plus admin UI, App Creator only.
- **Main risk:** rubber-stamping. It is mitigated by unticked defaults, per-pin evidence, `checkDecision` per pin and duplicate exclusion.
- **Expected speed-up:** about 1 source open per set instead of per pin. For a 10-pin set: 1 open plus 10 ticks plus 1 decision, against 10 opens plus 20 actions.

## Fit with the sprint
Set-first research produces set records whose `expected_pin_count` and set sources match exactly what a reviewer would open. Pins whose set source lists them are the ones that benefit.
