# "Waiting for production": catalogue gap report

A read-only comparison of the staging and production catalogues. It lists new pins, field differences, ID collisions, possible duplicates, approved and pending photos, staging-hosted files, production links that depend on staging storage, and board-scanning / bulk-matcher work. Nothing is matched automatically: every possible match is a decision for you.

**It changes nothing.** The five queries only read, and each session is set read-only first. The comparison runs offline on your computer, from the files you download. No keys are needed: you use the SQL editor you already sign in to.

Time: about 15 minutes.

## 1. Make a private folder

Outside any git repository, for example `~/PinHunt-Private/catalogue-gap/2026-11-12/`, with two sub-folders: `staging/` and `production/`.

The files contain catalogue data only: no user ids, emails, names or private file paths. Pin & Pop links and images are counted, never listed.

## 2. Run the five queries in each project

Run them in the **staging** project's SQL editor (Supabase dashboard, then SQL Editor), then again in **production**. Run each file on its own: paste it in and press Run.

| File (`supabase/verify/catalogue-gap/`) | Result | Save as |
|---|---|---|
| `1_summary.sql` | one cell of JSON | `1_summary.json`: copy the cell into a text file |
| `2_pins.sql` | one row per pin | `2_pins.csv`: use the editor's Export / Download CSV |
| `3_images.sql` | one row per photo record | `3_images.csv` |
| `4_storage.sql` | one row per catalogue file | `4_storage.csv` |
| `5_work.sql` | one cell of JSON | `5_work.json` |

Run them close together in time, and while no big batch is running if you can. The report is a snapshot either way.

### Large results

If a CSV has fewer rows than the summary says (the comparison checks this and stops with an error), the editor cut the result short. Add a range line before `order by` at the end of `2_pins.sql`, for example `where s.pinhunt_id < 'PHUK-00005000'`, then `>=` for the next part. Save the parts as `2_pins_part1.csv`, `2_pins_part2.csv` and so on. The same works for `3_images` and `4_storage`. Overlapping parts are fine.

## 3. Compare (offline)

From the repo root:

```sh
node scripts/catalogue-gap/compare.mjs ~/PinHunt-Private/catalogue-gap/2026-11-12 \
  --staging-ref <staging project ref> --production-ref <production project ref>
```

The refs are the 20 letters in each project's URL (`https://<ref>.supabase.co`). They aren't secrets.

It writes two files into the same folder:
- `report.md`: what's waiting, at a glance and by section.
- `review.csv`: one row per decision, critical first. The empty `decision` column is for you: `same`, `new`, `promote`, `keep production`, `skip`. A later promotion step only acts on rows you've decided.

If you want me to read the result, share `report.md`. It holds catalogue data only.

## What the sections mean

| Section | Meaning | Usual decision |
|---|---|---|
| Production depends on staging storage | A production pin shows a file stored in staging. **Critical:** if staging is reset or loses that file, production breaks. | Copy the file into production storage and repoint the pin |
| Pins only in staging | No production record has the same internal id. "Possible match" means a production pin shares an external id (e.g. Collectible PinTrader) or the same title + series + year. | Same pin, or a new pin? New pins get a production PinHunt ID |
| PinHunt ID collisions | The same PinHunt ID is a different record in each project. Never merged automatically. | Decide which is which; the staging one usually needs a new production ID |
| Field differences | Same record (same internal id and PinHunt ID) with different values. Shown field by field, production then staging. | Approve per field |
| Approved staging photos | *ready*: pin matched and rights allow it. *would replace*: production already shows a photo. *blocked*: rights don't allow it yet. *pin decision first*: the pin itself isn't matched. | Promote, keep production's, or hold |
| Pending in staging | Photos awaiting review in staging | Review them, or let them lapse and redo in production |
| No provenance record | A staging pin shows a staging file that has no `pin_images` row, so where it came from is unknown | Find the origin before promoting |
| Work in progress | Submissions, board scans and bulk-matcher items, by stage, and whether their target pin is safely matched | See `PRODUCTION-CATALOGUE-PLAN.md` |

The rights rule matches `clean-catalogue-images.mjs`, using **production's** `catalogue_sources`:
- Every photo needs public display and storage allowed.
- Edited photos (Pixian-cleaned, board scans, bulk uploads) also need a confirmed licence: recorded, not "pending", not no-derivatives.
- Pin & Pop images are always excluded under the current rules.

## Tested

`node --test scripts/catalogue-gap/` covers the comparison rules. The queries were run against a local in-memory replay of the migrations (PGlite, the same harness as `supabase/verify/local-replay.mjs`), in two shapes:
- a staging-like database with 045, 075 and 076;
- a production-like database without them.

The session-level read-only setting was confirmed to reject writes.
