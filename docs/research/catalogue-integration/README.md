# Independent catalogue: controlled integration pack (research branch)

**Nothing here is active, applied, scheduled or imported.**

| File | What |
|---|---|
| `01-engine-review.md` | Security, source compliance, evidence quality and ID safeguards review. Hardening fixes applied to the prototype. |
| `../../agents/proposed/catalogue-researcher.md` | 🔎 Basil, the Catalogue Research agent role (inactive; outside `.claude/agents/`) |
| `../../agents/proposed/routines/catalogue-research.md` | Routine prompt + activation steps (not created) |
| `03-staging-and-admin-design.md` | Staging tables, API routes, approval rules, admin screen |
| `proposed_045_catalogue_research_staging.sql.draft` | Additive SQL + rollback (not in `supabase/migrations/`) |
| `04-workflow.md` | Research → verification → approval → import, with gates and undo |
| `05-pilot.md`, `pilot_28_candidates.xlsx/.csv` | Pilot of 28 new candidates with a direct-verification checklist |
| `../id-reuse-investigation/impact_queries/Q0–Q5.sql` | Read-only impact checks for the 86 reused IDs |

## 1. Running the reused-ID impact queries

This session has **no read-only database access**: no credentials, and the agent guard blocks database connections by design. So I could not run them. Staging holds no data (`staging-db.mjs` copies schema only), so the queries must run on production, read-only.

**Simplest safe steps (about 5 minutes):**
1. Open the Supabase dashboard → the production project → **SQL Editor** → **New query**.
2. Open `docs/research/id-reuse-investigation/impact_queries/Q0.sql` and paste the **whole file**. Its first line, `set default_transaction_read_only = on;`, makes the run unable to write. It is the same guard `staging-db.mjs` uses. Click **Run**.
3. Repeat for Q1, then Q2. Q2 is the answer:
   - every `created_before_import` is 0 on user tables → **no user impact**
   - any number above 0 → run Q3/Q4 to list the rows
4. Paste or export the Q0–Q2 results back to me. Don't paste user IDs into a public issue; the repository is public.

**If Q0 errors with "schema backup_20260731 does not exist",** skip it. Q1–Q5 don't need it.

## 2. What needs your approval

| # | Decision | Why it's yours |
|---|---|---|
| A | Network access for research hosts + a terms-of-use check per host | Policy/legal; enables `page_fetch` evidence |
| B | Activate the Basil role and create the routine (paused, on-demand first) | Touches `.claude/` (needs `human-approved-config`) |
| C | Migration 045 (staging tables, ID sequence, identity-guard trigger) as an L3 change, staging first | Schema + trigger on `pins` |
| D | API routes + admin "Research review" screen (L2, App Creator only) | New routes/screen |
| E | Pilot go/no-go: direct verification of the 28, staging import, then production | Production data |
| F | Fix any user records found by Q2/Q3 | Production data, human-only |

## 3. Safest implementation sequence

1. **Run the impact queries** (§1, read-only). Decide F if anything shows up.
2. **Identity guard first.** Approve the guard part of 045 (sequence + `pins_identity_guard` trigger) and the importer identity check. Apply on staging, then production.
   - This closes the reuse risk in the existing admin import **before** any new data flows.
   - Check that no existing admin flow legitimately changes both title and character in one update.
3. **Staging tables + API + admin screen** (C, D) on staging. Load the 13 Oct run (dry run, then load), with no import.
4. **Pilot direct verification** of the 28 (E). Measure time per pin and the snippet error rate.
5. **Pilot import on staging**, smoke test and rehearse rollback. Then production as one rollback-ready batch.
6. **Turn on network access and the paused Basil routine** (A, B). Use on-demand runs for one month of new releases, then decide on a schedule.
7. **Later:** turn the 20 verified duplicates into audited enrichment suggestions. Resolve the single-source sets. Add `release_status` to the evidence spec.
