# Production rollout: migrations and Pin & Pop import

**Status:** ready for review, 14 Nov 2026. Nothing has been applied. You run every step; each one writes to production only after its own checks.

This covers steps 2 and 3 of the plan (`PRODUCTION-CATALOGUE-RESET.md`):
- bring production's database level with what the app and tools need;
- import the Pin & Pop catalogue.

Moving collections, removing the old catalogue and applying the photo links come next. They need the photo review first.

## Before you start

- [ ] **Today's backup** is listed in the production project, under Database → Backups.
- [ ] **Nobody else** is changing production while you do this.
- [ ] **Run each step on staging first,** where it hasn't already been applied there. The gap report's migration table shows what each project has.

## Step A: migrations (production SQL editor)

Apply in this order. Each one is a file you paste into a new query and run:

| Order | File | What it does | Notes |
|---|---|---|---|
| 1 | `supabase/migrations/055_market_retention_and_valuation_history.sql` | Valuation history table | Already on staging; production lacks it |
| 2 | `supabase/migrations/078_pinhunt_id_sequence.sql` | Safe PinHunt IDs for new pins (stays below the Pin & Pop range) | **New. Run on staging first.** |
| 3 | `supabase/verify/production-rollout/075_pinandpop_catalogue_search.PRODUCTION.sql` | Search indexes for the big catalogue | Production copy: refuses anything but production. Takes a minute or two. |
| 4 | `supabase/verify/production-rollout/076_search_catalogue_pins.PRODUCTION.sql` | Fast catalogue search function | Production copy |
| 5 | `supabase/verify/production-rollout/077_catalogue_coverage_paged.PRODUCTION.sql` | Paged contributor screens | Production copy |
| 6 | `supabase/migrations/076_bulk_image_matcher.sql` | Bulk image matcher tables | Optional; the feature stays off until switched on |

**Expect** "Success. No rows returned" for each. The production copies stop with "Nothing was changed" if pointed at staging.

**Check:** re-run the gap report. Its migration table should show these as *yes* for production.

**Not included:**
- **052 and 053** are on neither project; that's a separate decision.
- **Board scanning** gets its own number (079 or later) when it's merged.

## Step B: Pin & Pop import (Terminal, about 5–10 minutes)

The tool is `artifacts/api-server/scripts/import-pinandpop-production.mjs`.
- It reuses the staging importer's own code, so production gets exactly what staging got: pins, sets, external IDs, reference images (internal only) and characters.
- It **only adds** Pin & Pop data and updates the Pin & Pop licence record. It never deletes or changes old pins or anyone's collection.
- **Before writing, it checks:**
  - the settings say production;
  - the address matches the production ref;
  - the database's own marker says "production";
  - the staging marker is absent.
- **Then it asks you to type the production ref.**

### B1. A production settings file

Make a plain-text file **outside** any project folder, e.g. `~/Documents/PinHunt-Private/production-settings.txt`:
```
PINHUNT_ENV=production
PRODUCTION_PROJECT_REF=<production ref>
STAGING_PROJECT_REF=<staging ref>
SUPABASE_URL=https://<production ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<production secret key>
PINANDPOP_API_TOKEN=<your Pin & Pop API token>
```
- The production secret key is under the **production** project → Project Settings → API Keys.
- The Pin & Pop token is in your staging settings file, or from Pin & Pop.
- **Never share this file.** Delete it when the rollout is done.

### B2. Check (reads only)

From the downloaded folder's `artifacts/api-server`:
```
node --env-file="$HOME/Documents/PinHunt-Private/production-settings.txt" scripts/import-pinandpop-production.mjs check --csv ~/Downloads/pins-2026-11-11-212426.csv
```
**Expect:**
- `target confirmed: PRODUCTION`;
- the current counts, with 0 Pin & Pop pins;
- the CSV report: about 116,502 rows, all OK;
- `ID check: no old pin uses a Pin & Pop PinHunt ID`;
- `check only: nothing written.`

### B3. Import

The same command with `import` and `--apply`:
```
node --env-file="$HOME/Documents/PinHunt-Private/production-settings.txt" scripts/import-pinandpop-production.mjs import --csv ~/Downloads/pins-2026-11-11-212426.csv --apply
```
1. **Type the production ref** when asked.
2. **Expect** progress every 2,000 pins, then totals and characters.
3. **Then** run `vacuum analyze pins;` in the production SQL editor.

### B4. Catch up with pins added since the CSV

```
node --env-file="$HOME/Documents/PinHunt-Private/production-settings.txt" scripts/import-pinandpop-production.mjs sync --apply
```

**Check:**
- **Production now holds** about 116,500 Pin & Pop pins and about as many `pin_and_pop` image records.
- **The app still runs as before:** TestFlight is still on staging, and the old pins are still there.
- **The gap report** now shows Pin & Pop in both projects.

## If something goes wrong

- **A migration fails:** it's one transaction, so nothing from it stays. Send me the error text.
- **The import stops part-way:** run the same command again. It updates rather than duplicates. Before the old catalogue is removed, the import can be undone completely by deleting the Pin & Pop pins, which nobody's collection uses yet. I'd write that SQL if needed.

## Tested

- `scripts/catalogue-gap/production-import.test.mjs` runs the real import code against an in-memory stand-in for Supabase. It checks:
  - the guards;
  - that check and dry runs write nothing;
  - the confirmation step;
  - exact rows (including characters and the licence row);
  - re-running without duplicates;
  - refusal on an ID clash;
  - that the production migration copies differ from the originals only in the guard.
- 078 was replayed locally: it starts above the highest old ID, ignores PHUK-68048143 and the Pin & Pop IDs, and refuses to enter the Pin & Pop range.
- **Not tested here:** the real production database. That's what B2's check is for.
