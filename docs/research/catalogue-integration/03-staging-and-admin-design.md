# Evidence staging and admin approval — design (proposal)

The goal is to reuse what PinHunt already has. Almost every moving part exists today.

| Need | Reuse | New |
|---|---|---|
| Who may decide | `is_app_creator()` + `requireAppCreator` (040/041). Admins keep read access. | — |
| Evidence rights/provenance | `catalogue_sources` (037) for licensed providers | Per-claim `catalogue_evidence` rows (web facts aren't "providers") |
| Proposed records | Master Catalogue column set (`import-trusted-catalogue.mjs` / `catalogue-import.ts` field map) | `catalogue_candidates.proposed` jsonb in the same shape |
| Import + rollback | `import_batches` with `row_snapshots`, the `/admin/catalogue-import/preview` → apply → `/rollback` routes | A "from approved candidates" source for the existing preview |
| Changes to existing pins | `apply_validation_changes` RPC + `pin_change_audit` (021/022) | — |
| Sets and multi-set membership | `pin_sets`, `pin_set_memberships`, `pin_external_ids` (037) | — |
| Admin UI pattern | `app/admin/catalogue-validation.tsx` (suggestion list → decision), `app/admin/import.tsx` (preview/apply/rollback) | One screen: `app/admin/research-review.tsx` |
| ID safety | — | `next_pinhunt_id()` and the `pins_identity_guard` trigger |

**Schema:** `proposed_045_catalogue_research_staging.sql.draft`. It adds 3 tables, a sequence, 2 functions and 1 trigger, all additive, with rollback SQL included. It is not in `supabase/migrations/`.

## How data gets in (agents never touch the DB)

1. The research agent opens a **draft PR** containing packets and `out/records_with_evidence.json`.
2. The maintainer reviews the PR and merges it to a research branch, never to `main`.
3. **App Creator only:** in the app, *Admin → Research review → Load run*. Upload `records_with_evidence.json` and enter the git commit.
   - The API server (service role) runs a **dry-run** first: counts, rejected rows, duplicates against live pins.
   - It then writes `catalogue_research_runs`, `catalogue_candidates` and `catalogue_evidence`.
   - The server re-applies the engine's source policy. The table CHECKs reject excluded sources regardless.
4. Nothing reaches `pins` until step 6 of the workflow (04).

## API (api-server, all `requireAppCreator`; supertest per route)

| Route | Purpose |
|---|---|
| `POST /admin/research/runs/preview` | Validate an uploaded run, return counts. No writes. |
| `POST /admin/research/runs` | Load a validated run into staging |
| `GET /admin/research/candidates?run&status&set&confidence` | Review list |
| `GET /admin/research/candidates/:id` | Fields, evidence and the duplicate's live pin, side by side |
| `POST /admin/research/candidates/:id/direct-check` | Record that the reviewer opened a source and confirmed fields (`human_direct_check` evidence, `checked_by`) |
| `POST /admin/research/candidates/:id/decision` | `approve`, `reject`, `needs_more_research` (+notes). The server enforces the approval rules below. |
| `POST /admin/research/import/preview` | Approved candidates → existing catalogue-import preview (dry run) |
| `POST /admin/research/import` | Apply via the existing batch machinery; IDs from `next_pinhunt_id()` |

## Approval rules (server-enforced, mirrored by table constraints)

- **Identity verified:** `record_confidence` is High/Medium, and **at least one `human_direct_check`** covers the identity fields (character/attraction and set).
- **No open blockers:** no blocking conflict (identity, edition size or type, chaser, set size). Variants are allowed but must be acknowledged in the decision notes.
- **Duplicates handled:**
  - `DUPLICATE` / `PROBABLE DUPLICATE` candidates can only be approved **as enrichment** of the existing pin. That produces field-level suggestions through `apply_validation_changes`, never a new row and never an overwrite.
  - `NEW` candidates can only be imported as new pins.
- **Set integrity:** a set's members are imported together. An incomplete set (e.g. Windows of Attraction 10/12) imports its known members, with the set flagged "X of Y released" (existing `pin_sets` behaviour), never placeholders.

## Admin screen: `app/admin/research-review.tsx`

**Pattern:** follow `catalogue-validation.tsx`. Keep it consistent with the Storybook palette (D-01). For web, use in-app confirmation UI, not native alerts (`.agents/memory/expo-web-action-confirmations.md`).

1. **Runs.** Loaded runs with summary chips: verified, review, duplicates, blocked sources.
2. **Queue.** Grouped by set, with filter chips: *Needs direct check · Ready to decide · Duplicates · Conflicts · Low identity*. Each row shows the pin, confidence badge, duplicate status and warnings count.
3. **Candidate detail.**
   - **Fields table:** value · confidence · publishers · variants. Each field links to its evidence list (publisher, class, method, note, *Open source* link).
   - **"I opened this source and it confirms…"** checkboxes per field, which write `human_direct_check` rows.
   - **Duplicate panel:** shows the live pin (title, set, characters, image) next to the candidate.
   - **Actions:** *Approve as new pin* / *Approve as enrichment of PHUK-…* / *Needs more research* / *Reject*. Notes are required for anything other than a clean approve.
4. **Set view.** Expected vs found, members, and an approve-set action, which still requires each member to pass its checks.
5. **Import.** Approved, not-yet-imported candidates → **Preview** (existing import preview UI) → **Apply** → batch page with **Rollback**.

**Rendering safety:** evidence notes and values render as plain text. Only `https:` links open, and only via `Linking.openURL`. Nothing from staging is ever shown to collectors.
