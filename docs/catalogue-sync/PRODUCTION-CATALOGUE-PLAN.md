# Moving catalogue work to production

**Status:** proposal, 12 Nov 2026. Nothing here has been applied. Every step that touches a project, a deploy or a rights rule is a separate maintainer decision.

**Target:** production holds the real catalogue, and catalogue work (approvals, board scanning, bulk photos, Pixian clean-up) happens there. Staging tests code, accounts and trading. The catalogue flows **production to staging only** (`copy-catalogue-to-staging.mjs`). Accounts, trades and messages never move in either direction.

## 1. What is known, and what isn't

| | Source |
|---|---|
| TestFlight / preview builds use staging | `docs/release/EAS-PREVIEW.md`, `eas.json` |
| The only API (`pin-hunt-uk` on Render) uses staging, despite `API-DEPLOY.md` calling it production | #8 audit, 6 Nov |
| Every catalogue-writing script is staging-only (`staging-guard.mjs`) | code |
| The PinHunt ID sequence (`next_pinhunt_id()`, 045) exists in staging only | #8 audit; `1_summary` reports it |
| The admin "new pin" screen picks a **random** PinHunt ID (`app/admin/pin/[id].tsx`) | code |
| Supabase Pro since 6 Nov; daily backups expected, not yet confirmed; restore not rehearsed | #54 |
| **Not known:** the size of the gap, whether production links to staging files, whether board scanning or bulk matching has run against staging | needs the gap report (`GAP-REPORT.md`) |

## 2. Board scanning and bulk image matching

Both are built, tested with mocks, **not merged**, and staging-only:
- board scanning: branch `claude/pinhunt-bulk-board-scanning-fd43nb`, migration 075;
- bulk image matcher: branch `claude/pinhunt-bulk-image-matcher-7sohut`, migration 076.

Render deploys `main`, so these can only have run against staging through an API started from the branch, for example `start:staging` on your laptop. The gap report shows whether any results exist.

### What each saves, and where

| Saved | Board scanning (075) | Bulk matcher (076) |
|---|---|---|
| Permission record | `board_scans` row: basis, public display, not-third-party declaration | `bulk_image_batches` row: supplier, basis, licence, public display |
| Original photo | private `board-scans` bucket (board + crops) | private `bulk-image-matcher` bucket |
| Match decisions | `board_scan_items.decision` / `decided_pin_id`, **keyed by staging PinHunt ID** | `bulk_image_items.matched_pinhunt_id`, **keyed by staging PinHunt ID** |
| Cleaned photo (Pixian, unwatermarked) | private `pin-contributed-images` bucket | private `bulk-image-matcher` bucket |
| Published photo | watermarked copy in public `pin-catalogue`, plus a `pin_images` row (source `pinhunt_board_scan`) and `pins.image_url` | the same, with source `pinhunt_bulk_upload`; also keeps the replaced URL |

All of it lives in staging's database and staging's storage. If staging were reset, it would be lost: Supabase database backups don't include storage files.

### How it could reach production

Pins are matched by PinHunt ID, and staging IDs aren't guaranteed to mean the same pin in production. So only work whose target pin the gap report classes as **"same pin in both"** is safe to carry over without a pin decision.

1. **Published photos** are ordinary approved staging photos. Promote them like any other:
   - Copy the clean original from the private bucket, not the watermarked public copy.
   - Publish it in production through the same `publishContributedImage` path, which re-watermarks it.
   - Carry the permission record across, because `source_record_id` points at a staging row that won't exist in production.
2. **Confirmed and cleaned, not yet approved:** either finish review in staging and treat them as (1), or carry the cleaned file plus decision across and approve in production. The first reuses existing screens and is simpler.
3. **Suggested or unreviewed items:** don't carry them across. Re-run in production once the tools are live there. Matching costs a few AI calls per photo. Pixian runs only after confirmation, so no Pixian spend is repeated.

**Pixian credits** were spent on the cleaned files, so (1) and (2) are the work worth keeping.

**Recommendation:** treat what's already in staging as one batch to keep, and run all *new real* batches in production once it's ready (section 4). Until then, keep staging batches to the small calibration runs the runbooks describe.

## 3. One-off catch-up or a small promotion tool

Decide from the gap report's numbers, not before.

| | One-off manual catch-up | Small reusable promotion script |
|---|---|---|
| What it is | You work through `review.csv` in the dashboards: download, upload, edit row, add `pin_images` row | One maintainer-run script, dry run by default, that acts **only on rows you marked** in `review.csv` |
| Effort to set up | none | about 1–2 days of agent work plus your review; it needs a production-write guard, the mirror of `staging-guard.mjs` |
| Effort per photo | about 3–5 minutes by hand | seconds |
| Audit and undo | whatever you note down | log of promoted / skipped / failed; original kept; revert command like `clean-catalogue-images revert` |
| Repeat-safe | no: easy to do twice or miss one | yes: keyed by staging `pin_images.id` and file hash |
| Risk | slips: wrong pin, a missing provenance row, a watermark forgotten | a production-writing script exists, so it needs a typed confirmation and a production ref check (#385 requirements) |

**Rule of thumb:**
- About 25 photos or fewer, about 25 pin decisions or fewer, and no more real staging batches planned: do it by hand. It costs about the same as yesterday, once.
- More than that, or more real staging batches before production is ready: build the small script.

The script follows #385's requirements and is retired after launch. Pin and field decisions stay manual in both cases: they're judgements, not transfers.

Either way:
- **Production's own photos win by default.** Replacing one is an explicit `promote` decision.
- **Pin decisions come before their photos.**
- **New pins get production IDs**, minted in production. The staging-to-production pairing is recorded in `review.csv`.
- **Failures are per item.** Upload the file first, then update rows. Re-running retries only failures, and a leftover uploaded file is harmless.
- **Critical items go first:** production links to staging files, then everything else.

## 4. What production needs before catalogue work moves there

| Area | Needed | Who | Can run alongside the other sessions? |
|---|---|---|---|
| **API** | A second Render service from `main` using the **production** Supabase project and its service-role key. Separate or shared OpenAI and Pixian keys with caps (`CONTRIBUTOR_DAILY_*`, `BOARD_*`, `BULK_*`). `BULK_IMAGE_MATCHER_ENABLED` off until enabled deliberately. Point the EAS `production` environment and the contributor website's production target at it. Relabel the existing service as staging in `API-DEPLOY.md`. | you (Render, EAS) | Yes. It doesn't touch the staging API they test against. |
| **Permissions** | Confirm who has App Creator / admin in production. MFA on those accounts (#51) before admin work there. | you | Yes |
| **Review** | Already built in: nothing publishes without a reviewer action, in submissions, board scans and bulk matching | — | — |
| **Migrations** | Bring production level with what the tools need, staging first as usual: <br>• 045's `next_pinhunt_id()`, so new pins get safe IDs (it should be split from 045's staging-only research tables; separate decision) <br>• 050–055 per the #8 audit <br>• the 073 project marker <br>• 075 and 076 once merged <br>`1_summary` shows each project's state | you; an agent can draft | **Coordinate.** 075/076 are on unmerged branches. Merging them has three small conflicts: route registration, admin menu, memory index. Their shared `pinRank.ts` is identical. Merge one, rebase the other, then apply. |
| **Admin "new pin" IDs** | Replace the random `generatePinhuntId()` in `app/admin/pin/[id].tsx` with `next_pinhunt_id()` | agent ticket | Yes |
| **Image storage** | Production `pin-catalogue` (public) exists. 075/076 create their private buckets. Bucket hardening #38. | — | After migrations |
| **Backups** | Confirm daily backups appear for **both** projects and rehearse one restore (#54). Add a regular copy of the image buckets to separate storage, because database backups don't include files. | you; an agent can write the copy script | Yes |
| **Staging test data** | After the catch-up, re-run `copy-catalogue-to-staging.mjs --refresh-images` so TestFlight shows production's photos. Seed accounts with the existing scripts. | you | After the catch-up |

## 5. Pin & Pop

You've said the contract is now signed. **I can't verify it:** the repo and issues hold no copy or summary, and #431 still lists "written terms" as unsigned (19 Oct).

The project still enforces the pre-contract rules everywhere:
- the 042 constraint: Pin & Pop `pin_images` can't be publicly displayed;
- `catalogue_sources` flags;
- the `catalogue-copy.mjs` skip;
- the 053 and source-registry exclusions;
- the board-scan and bulk-matcher rule: reference-only, never stored or published.

This report follows the same rules.

To change that, the permitted uses need recording first, in the rights record, not in code:
- data fields;
- image display;
- image storage or caching;
- derived data such as embeddings;
- attribution wording;
- whether it covers staging and production;
- what happens on termination.

Relaxing each exclusion is then a separate, approved change (#431, "Blocked by").

Until then, Pin & Pop material is never promoted. Its use as an internal matching reference should also be confirmed as covered.

## 6. Smallest next steps

1. **You:** run the gap report (`GAP-REPORT.md`, about 15 minutes) and share `report.md`.
2. **Fix any critical item** (production links to staging files) first, by hand. It's normally a handful.
3. **Decide manual vs script** from the counts (section 3).
4. In parallel:
   - set up the production API service;
   - confirm backups for both projects;
   - MFA on production admin accounts.
5. **Coordinate the merge of 075/076**, then apply migrations staging first, then production.
6. **Switch the admin tools to production;** staging becomes test-only. Re-copy the catalogue into staging.
