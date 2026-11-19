# Production readiness and the TestFlight switch-over

**Status:** plan only, updated 14 Nov 2026. Nothing has been switched, deployed or applied.

**Goal (maintainer decision, 14 Nov 2026):** the TestFlight app points at **production**, for both Supabase and the API. Photos approved in the admin view then land in the production catalogue and show in TestFlight. Staging stays for testing changes before they reach TestFlight.

**What changed since 12 Nov** (`artifacts/api-server/scripts/PINANDPOP.md`):
- Staging's catalogue is now **Pin & Pop**: 116,503 pins, each with a reference-only image record. The old 3,160 pins were removed (after a backup).
- Production still has the old catalogue.
- Migrations 075, 076 (two files: `076_search_catalogue_pins`, `076_bulk_image_matcher`) and 077 are on `main` and applied to staging, not production.
- The bulk image matcher is merged (off unless `BULK_IMAGE_MATCHER_ENABLED=true`). Board scanning is merged too (migration 083, off unless `BOARD_SCAN_ENABLED=true`).

Columns: **Who** — *you* = maintainer only (dashboards, credentials, deploys); *agent* = can be prepared as a draft or PR for your review. **Other sessions** — whether it can happen without affecting parallel work.

## P0: protect what exists (now)

| # | Item | Who | Other sessions |
|---|---|---|---|
| 1 | **Preserve staging work.** Don't reset staging (`staging:restore`) or delete its buckets. **Don't run `copy-catalogue-to-staging.mjs` at all for now:** since 11 Nov it would put production's *old* catalogue back into staging next to Pin & Pop. Board scans, match decisions and processed photos are work to keep. | you | Unaffected |
| 2 | **Confirm database backups for both projects (#54).** In each project, Database → Backups: are daily backups listed, how many days are kept, is point-in-time recovery on? | you | Unaffected |
| 3 | **Image files have no backup.** Supabase backups don't include Storage files. Take a one-off copy of staging's catalogue-work buckets (`pin-catalogue`, `pin-contributed-images`, `bulk-image-matcher`, `board-scans` if present) and production's `pin-catalogue`. An agent can write a staging-guarded, **download-only** script if you want one. | you; agent can prepare | Unaffected (reads only) |
| 4 | **Run the gap report** (`GAP-REPORT.md`). Fix any **critical** item (a production pin showing a file stored in staging) first. | you | Unaffected |

## P1: prepare (no switch)

| # | Item | Who | Other sessions |
|---|---|---|---|
| 5 | **Admin security (#51).** Run `supabase/verify/readiness/admin_access.sql` in each project (for your eyes only: it shows emails). Every `is_admin` / `is_app_creator` account should be expected and have MFA. Turn on 2FA for every member of Supabase, Render, Expo and GitHub. App Creator should be you only in production. | you | Unaffected |
| 6 | **Migration parity.** The gap report's "Migrations detected" table shows each project side by side. Everything production lacks is applied staging first, then production, with that migration's runbook. Five migrations can't be detected by the table (056, 061, 063, 064, 074); use their verify scripts. See the switch-over, step A. | you; agent drafts | Unaffected until applied |
| 7 | **Safe PinHunt IDs in production.** Production lacks `next_pinhunt_id()` (it came with 045, which also adds staging-only research tables). Draft a small migration with **only** the sequence and function, starting above the highest non–Pin & Pop PinHunt ID. Pin & Pop IDs start at `PHUK-10000001` and never collide with it. | agent drafts (L3), you apply | Unaffected. Number it after the highest on `main` (077) and after board scanning's. |
| 8 | **Random pin ID fix.** `app/admin/pin/[id].tsx` invents a random `PHUK-` number for new pins, which could even land in the Pin & Pop range (≥ `PHUK-10000000`). Change it to ask `next_pinhunt_id()` at save time. Depends on 7. | agent PR | Unaffected: nobody else touches that file |
| 9 | **Board scanning.** Merged as migration `083_board_scans`, behind `BOARD_SCAN_ENABLED` (default off: every board-scan route returns 404). Separately, `main` has two files numbered 076. They're independent, but record which order each project received them in. | done | Unaffected |
| 10 | **Production API service, prepared but unused.** A second Render service from `main`, connected to the production Supabase project (switch-over, step C). Check `/api/healthz`. Fix `API-DEPLOY.md`, which calls the staging service production. | you (Render); agent fixes the doc | Unaffected: new service, staging's untouched |

## Switch-over: TestFlight to production

Do these **in order**. Each step lists how to check it. Steps A–E change nothing the app uses; F is the switch.

### A. Migration parity

Production must have every migration staging has. From the gap report's table and what's known (#8 audit, 6 Nov; PINANDPOP.md):
- **Up to 074:** whatever the table shows missing in production, especially 050–055, 069 (scan outcomes) and 073 (age confirmation, plus its project marker per `073_RUNBOOK.md`).
- **045's ID function only** (item 7), not its research tables.
- **075, `076_search_catalogue_pins`, 077:** apply with the production guard in place of the staging one, as `PINANDPOP.md` → Production rollout, step 2 describes.
- **`076_bulk_image_matcher`:** needed for the admin bulk matcher. Leave the feature switched off until you want it.
- **Board scanning:** `083_board_scans`. Leave `BOARD_SCAN_ENABLED` off until you want it.
- **Anything else** the report's migration table shows missing.

**Check:** re-run the gap report. Every row in the migration table should say *yes* for production, and each migration's verify script should pass.

### B. Catalogue in production (Pin & Pop rollout)

TestFlight testers currently see Pin & Pop on staging. Without this step they'd see production's **old** catalogue, scans would match old pins, and admins would have no Pin & Pop images to compare against.

Follow `PINANDPOP.md` → *Production rollout*. It's a separate, approved piece of work:
1. back up production;
2. decide what happens to existing collections on the old pins: remap or archive, **never** `reset-old` as it is;
3. build a separate, approved production import entry point, since the import script is staging-only by design;
4. import.

The import also creates the **Pin & Pop reference image records** that the admin side-by-side view and the scan comparison use.

**Check:**
- production has about 116,500 Pin & Pop pins and a matching number of `pin_and_pop` image records;
- the admin review screen shows the Pin & Pop image beside a contributed photo;
- the gap report's exposure check shows the production count.

### C. Production API (Render)

**Done 14–15 Nov 2026:** `pinhunt-api-production`, healthz OK, production ref checked. Steps D (redirect URLs, storage check; email uses the built-in sender) and F (TestFlight `preview` switched to production, sign-in and app checked by the maintainer) are also done; E was folded into F with OTA rollback ready.

Use a **second** Render service, not the existing `pin-hunt-uk`. That one is staging's API. Repointing it would leave staging without an API, and break the contributor-website preview and the other sessions' staging test runs.

Set these on the new service (names only; values from the production Supabase project and your accounts):
- **Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, all from the **production** project. The service-role key is what lets the scan and admin views read Pin & Pop reference images server-side.
- **AI:** `OPENAI_API_KEY`, `OPENAI_SCAN_MODEL` (leave unset for the default), optionally `OPENAI_SCAN_REASONING_EFFORT` and `SCAN_BUDGET_MS`.
- **Pixian:** `PIXIAN_API_ID`, `PIXIAN_API_SECRET` and **`PIXIAN_TEST_MODE=false`**, so clean-ups are real and unwatermarked. Set caps (`CONTRIBUTOR_DAILY_*`, `BULK_*`, `BOARD_*`) and check the Pixian credit balance first.
- **Pin & Pop:** `PINANDPOP_API_TOKEN`, then schedule the daily incremental sync and weekly full refresh (`PINANDPOP.md` → Sync).
- **Off until you decide:** `BULK_IMAGE_MATCHER_ENABLED`, `BOARD_SCAN_ENABLED`, `SOLDGRAPH_ENABLED`, and the market flags in `docs/market-data/RIGHTS.md`.
- **eBay and Google Vision,** as on staging if you use them: `EBAY_*`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`.

**Check:**
- `/api/healthz` responds;
- the service's `SUPABASE_URL` contains the production ref, not staging's. Compare the 20 characters by eye in Render → Environment;
- a sign-in token from the production project is accepted: a scan from a test build (step E) works.

### D. Production Supabase settings the app relies on

- **Authentication → URL Configuration:** add `pinhunt://reset` and `pinhunt://confirm` to Redirect URLs, as on staging, plus the contributor website's addresses if it moves too.
- **Email:** sign-up confirmation and password-reset templates and sender, matching staging.
- **Storage:** the `pin-catalogue` bucket is public; the contributed-photo bucket is private (#38).

**Check:** register a new test account in production, confirm the email, reset its password, and confirm 18+.

### E. Rehearse on one phone first

Before changing the `preview` environment, build or run the app against production on a single device. Either:
- use an Expo `development` build with production values in the EAS `development` environment; or
- use the contributor website's preview build with production values.

Then:
- sign up;
- add a pin to a collection;
- scan a pin;
- contribute a photo;
- approve it as admin, and see it on Pin Detail.

**Check:** the photo is in the production `pin-catalogue` bucket, and the gap report shows it in production.

### F. Switch the TestFlight (`preview`) environment

**Before:** note the current `preview` values in a private place. They're needed to roll back.

In expo.dev → `uk-pin-app` → Environment variables → **preview**, change these three:
- `EXPO_PUBLIC_SUPABASE_URL` → production URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` → production **anon** key (never the service-role key)
- `EXPO_PUBLIC_API_BASE_URL` → the new production API's address, ending in `/api`

Leave unset: `EXPO_PUBLIC_DEMO_MODE`, `EXPO_PUBLIC_DEMO_ADMIN`, `EXPO_PUBLIC_DEMO_PINS`, `EXPO_PUBLIC_RESEARCH_PREVIEW`, `EXPO_PUBLIC_DOMAIN`.

**OTA update or new TestFlight build?** These values are written into the JavaScript bundle when it's built. They aren't part of the native fingerprint (`fingerprint.config.js`; `app.json` doesn't use them). So an **OTA update** (`ota-update`, or `eas update --channel preview --environment preview`) carries the change, **provided** the TestFlight build on the phones has the same runtime version as `main`.
- `RELEASE-CONFIG.md` (#588, 11 Nov) changed native settings and says a new `testflight-build` is required before OTA updates reach phones again.
- If no TestFlight build has been made since then, make one **with the production values already in `preview`**. That build carries them from the start.
- To check: the `eas update` output names the runtime version it targeted. If no installed build has that runtime, phones ignore the update.

**After switching, testers:**
- are **signed out**: sign-in sessions are stored per Supabase project;
- need **production accounts**: staging accounts don't exist there;
- lose their staging collections from the app's view. Local collection data is tied to the signed-in account and cleared at sign-out, so it can't leak into production.

Real accounts, trades and messages created by testers now live in production. Use clearly named test accounts where it's only testing.

**Check:** force-quit and reopen the app twice. Pin Detail shows Pin & Pop attribution. Approving a photo in the admin view makes it appear in the app.

### G. Update the docs (same day)

- **`docs/release/EAS-PREVIEW.md`:** "Test data safety" and "Point it at the staging Supabase project" become: `preview` = production; test against staging with the `development` profile or the web preview.
- **`docs/release/RELEASE-CONFIG.md`:** the EAS profiles table, where `preview` "Points at staging".
- **`docs/release/API-DEPLOY.md`:** name both Render services and what each points at.

Staging stays the place to try **migrations and risky changes before they go out by OTA**. From now on, an OTA to `preview` reaches a production-connected app.

### Rolling back

- **App:**
  1. Put the three `preview` values back to the staging ones you noted.
  2. Publish an OTA update to `preview`, or republish the previous update group (`eas update:republish`).
  3. Ask testers to force-quit and reopen twice.
  If a new TestFlight build was made with production values, the OTA overrides its JavaScript, provided the runtime versions match.
- **API:** the production Render service can be stopped or left idle. Staging's service was never changed.
- **Data:** anything created in production during the switch (accounts, collections, approved photos) **stays in production**. Nothing is copied back. Rollback restores which project the app *talks to*, not the data.
- **Database:** if a migration in step A misbehaves, use that migration's rollback SQL from its header. Restore from backup only as a last resort, and only into a new project first (item 2).

## After switching

- Real catalogue work (approvals, board scans, bulk photos) happens in production. Staging is for testing.
- The catch-up decided from the gap report moves the staging work worth keeping into production. Photos on Pin & Pop pins can follow after step B, because Pin & Pop pins have the same PinHunt ID in both projects.
- Refreshing staging's catalogue from production needs a fresh look before anyone runs `copy-catalogue-to-staging.mjs` again. It skips Pin & Pop images and links by design, and was written for the old catalogue. Pin & Pop's own sync keeps staging's Pin & Pop data current meanwhile.
