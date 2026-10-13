# Workflow: research → evidence verification → admin approval → safe import

```
 1 RESEARCH           2 ENGINE CHECKS         3 DIRECT VERIFICATION      4 ADMIN DECISION         5 IMPORT (dry run → apply)
 agent (Basil)        offline, in the PR      human opens sources        App Creator              existing import machinery
 packets + draft PR → tests, audit=0,      →  ticks fields confirmed  →  approve / enrich /    →  preview → apply → batch
 no DB, no IDs        verified/review/dupes   (human_direct_check)       reject / more research   snapshot → rollback ready
                                                                                                   6 POST-IMPORT CHECKS
```

| # | Step | Who | Gate to pass | Output | Undo |
|---|---|---|---|---|---|
| 1 | **Research.** Packets from permitted public sources. | Research agent (draft PR) or a human | Role-file source rules | `evidence/*.json`, run report | Close the PR |
| 2 | **Engine checks.** `unittest`, engine run, `engine.audit`. | Agent, re-run by the maintainer on the PR | Tests pass, audit = 0 problems, no excluded/marketplace claims accepted | `out/` workbook + `records_with_evidence.json` | — |
| 3a | **Load to staging** (dry run, then load). | App Creator | Preview shows 0 policy violations | Rows in `catalogue_*` staging tables | Delete the run (cascade) |
| 3b | **Direct verification.** Open ≥1 official or news source per candidate and confirm the identity fields. Confirm edition, date and price where shown. | Human reviewer | Identity confirmed by a human; blocking conflicts resolved with a note | `human_direct_check` evidence | Add more checks |
| 4 | **Decision.** | App Creator | Approval rules in 03 (server + DB constraints) | `approved` / `rejected` / `needs_more_research`; enrichment suggestions for duplicates | Re-decide before import |
| 5 | **Import.** Approved NEW candidates through the existing import preview, then apply. Enrichments through `apply_validation_changes`. | App Creator | Preview has no ID collisions; identity guard on; IDs from `next_pinhunt_id()` | New `pins` rows (`catalogue_status = 'trusted'`, `verification_status = 'verified'`, `is_searchable` per decision), `pin_sets` / memberships, `pin_external_ids` for product codes, `pin_change_audit` for enrichments | `import_batches` rollback; audit reversal |
| 6 | **Post-import checks.** Search, set browse, collection add and scan candidates on staging, then production. | Maintainer | Smoke checks pass | Candidate status `imported` with `imported_pin_id` | Rollback batch |

## Invariants (never broken at any step)

1. **No fact without evidence.** Engine audit, plus approval needs a human direct check.
2. **No excluded source.** Enforced in engine code, the staging CHECK constraint and the role file.
3. **No invented pins.** Incomplete sets stay incomplete.
4. **A `pinhunt_id` is never reused or repurposed.** New pins get a fresh ID. Existing pins only receive audited field changes.
5. **Agents never write to the DB, import, approve or merge.** Enforced by the guard hook and the operating model.
6. **Everything is reversible:** run delete, batch rollback, audit trail.
7. **Staging is never visible to collectors.** RLS limits it to admins; writes go through `requireAppCreator`.
