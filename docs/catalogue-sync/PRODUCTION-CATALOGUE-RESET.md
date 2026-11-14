# Production catalogue reset: Pin & Pop only

**Status:** plan, 14 Nov 2026. Nothing has been run. Every step that writes to production is run by you, after a dry run, and only once the tool for it has been reviewed.

**Maintainer decisions (14 Nov 2026):**
- **Catalogue only.** Production's catalogue becomes Pin & Pop only. Sign-in accounts, profiles and settings stay.
- **Old photo files are deleted.** The 2,977 old catalogue photos in production storage go too.

## What production holds now (export of 14 Nov, 21:19)

| | Production |
|---|---|
| Pins | 15,978: **2,978 active** (2,977 Collectible PinTrader + 1 added by hand) and **13,000 archived** seed pins. No Pin & Pop pins yet. |
| Pin photos | 2,977 in production storage, folder `pin-catalogue/collectible-pintrader/` (3,922 files, about 450 MB in total, including 947 files no pin shows). 289 more pins link to photos on eBay's servers. |
| Image records | 5,237 Collectible PinTrader + 300 with no source, all `pending` |
| External IDs | 2,977 Collectible PinTrader, 2,705 PinPics, 2,225 Pin Trading DB, **94 Pin & Pop** |
| Migrations missing | 045, 055, 075, both 076s, 077 (052 and 053 are missing in staging too) |
| `catalogue_sources` → `pin_and_pop` | Still the old "being explored, no rights" row. Must be updated to the v1.3 terms recorded in `PINANDPOP.md`. |

**Not yet known: what users have on the old pins.** The read-only pre-check counts it (step 1).

## The order, and why

Staging's order was *delete old, then import* (`PINANDPOP.md`). It had only 34 test collection entries, and they were simply deleted.

Production should go **import first, then move people's data across, then delete**:
- importing first means collection entries and boards on the 94 old pins already linked to Pin & Pop can be moved to the matching Pin & Pop pin, rather than lost;
- Pin & Pop pins and the old pins can sit side by side meanwhile. Their IDs don't collide: Pin & Pop uses PHUK-10000001 to PHUK-10130584 today, and the one old pin above PHUK-10000000 is PHUK-68048143.

## Steps

### 1. Pre-check (read-only, now)

Run `supabase/verify/readiness/production_catalogue_reset_precheck.sql` in the **production** SQL editor and send me the result (one JSON cell: counts only, no names or emails).

It discovers every table pointing at pins from the database itself, and reports:
- old pins, sets, image records and external IDs;
- every reference to an old pin, and what deleting the pin does to it: deleted with it, link cleared, or **blocks the delete**;
- pin IDs stored as plain text (boards, trade items, scan records);
- how many accounts have collection entries, photos or boards on old pins;
- which photo files the old pins use.

**What blocks a delete:** collection entries (`user_pins`), approved submissions (`pin_submissions.approved_pin_id`) and eBay duplicate checks (`pin_ebay_validations.suspected_duplicate_pin_id`). Each needs handling before pins can go. Boards and trade items hold plain-text IDs, so the database won't stop the delete, but they'd silently point at nothing.

### 2. Back up

- **Database:** in the Supabase dashboard, Database → Backups. Confirm a backup from today is listed (Pro plan, daily).
- **Old catalogue data:** you already have it. The production export from 14 Nov holds every pin's catalogue fields, every photo record and the file list. Keep it private and safe.
- **People's data on old pins:** export from the SQL editor before step 6 (the query is part of the step 6 script).
- **Photo files:** a database backup **doesn't include files**, so deleting them is permanent. If you still have the Collectible PinTrader export you imported from, that's your copy. If not, and you might want the photos again, say so before step 7 and I'll prepare a download-only script.

### 3. Migrations

Apply in order, each with the production guard in place of the staging one (`PINANDPOP.md` → Production rollout, step 2):
- `075_pinandpop_catalogue_search`
- `076_search_catalogue_pins`
- `077_catalogue_coverage_paged`
- 055, if it's wanted in production
- 045's PinHunt ID function on its own (`PRODUCTION-READINESS.md`, item 7)
- `076_bulk_image_matcher` when you want the matcher in production

**Check:** re-run the gap report. Its migration table should show these as *yes*.

### 4. Import Pin & Pop into production

**Needs a new tool.** `import-pinandpop.mjs` refuses anything but staging by design. A separate production entry point is needed (`PINANDPOP.md`, step 4). It would:
- reuse the same mapping code;
- check the target is production;
- show a dry run first;
- ask you to type the project ref before writing.

It also:
- updates the `pin_and_pop` sources row to the v1.3 terms and attribution;
- creates the reference image records the scan and the admin side-by-side view use;
- fills characters the same way as on staging.

**Check:** about 116,500 Pin & Pop pins and as many `pin_and_pop` image records. Search and Pin Detail work in a test build.

### 5. Move people's data to Pin & Pop pins (where an exact link exists)

For old pins already linked to a Pin & Pop ID (94 of them): point their collection entries and board entries at the matching Pin & Pop pin (`PHUK-` + 10,000,000 + Pin & Pop ID). Only exact links count; no matching by name.

**Check:** the step 6 dry run shows how many entries were moved and how many are left.

### 6. Remove the old catalogue (one guarded SQL script)

**Needs writing** once the pre-check numbers are in. It would be one script for the production SQL editor that:
- stops unless `pinhunt_environment()` says `production`, and unless the counts at the top match what you expect (taken from the pre-check);
- runs in **one transaction**: all or nothing;
- first shows (and lets you download) the people's data it's about to remove;
- removes collection entries and board entries still on old pins, clears approved-submission links, and removes eBay validation rows;
- **deletes the old pins and old sets.** Their image records, external IDs, set memberships, market rows and caches go with them, by cascade;
- finishes with `vacuum analyze pins` (run separately; it can't run inside the transaction).

**Check:** re-run the pre-check. Old pins should be 0 and Pin & Pop pins about 116,500.

### 7. Delete the old photo files

In the dashboard, Storage → `pin-catalogue`, then delete the folder **`collectible-pintrader`**. There's also one file in `pins/`; check it before deleting.

Do this **after** step 6, so nothing in the app points at a missing file, and only once you're sure about the copy (step 2).

### 8. After

- Add `PINANDPOP_API_TOKEN` to the production API and schedule the daily and weekly syncs (`PINANDPOP.md` → Sync).
- Re-run the gap report. The 8 staging bulk-matcher photos can now move: their Pin & Pop pins exist in production.
- Carry on with the TestFlight switch-over (`PRODUCTION-READINESS.md`).

## Rolling back

- **Before step 6:** nothing old has been removed. The import can be undone by deleting the Pin & Pop pins, which have no user data yet.
- **After step 6:** restore the old catalogue from the Supabase backup, into a **new** project first, then copy back what's needed. Moved collection entries stay moved.
- **After step 7:** photo files can only come back from your own copy.

## Who does what

| Step | Who | Ready? |
|---|---|---|
| 1 Pre-check | you run, I read | **Ready now** |
| 2 Backups | you | Ready |
| 3 Migrations | you apply; I can prepare production-guard versions | Needs preparing |
| 4 Production import tool | agent builds (reviewed PR), you run | Needs building |
| 5–6 Move data and remove old catalogue (SQL script) | agent writes from the pre-check numbers, you run | Needs the pre-check |
| 7 Delete files | you, in the dashboard | Ready after 6 |
