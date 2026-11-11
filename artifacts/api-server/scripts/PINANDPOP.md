# Pin & Pop catalogue: import, sync and rollout

Pin & Pop (P&P) replaces the old seed + Collectible PinTrader catalogue. It
went live on **staging** on 11 Nov 2026. Production hasn't been touched: see
[Production rollout](#production-rollout-not-done).

Code:

| What | Where |
|---|---|
| Mapping, CSV parser, API client, DB writer | `scripts/lib/pinandpop.mjs` (+ `.d.mts`, tests in `pinandpop.test.mjs`) |
| Reset / CSV import / sync CLI | `scripts/import-pinandpop.mjs` (staging-guarded) |
| Server-side sync (App Creator only) | `src/routes/pinandpop-sync.ts` |
| Search indexes | `supabase/migrations/075_pinandpop_catalogue_search.sql` |
| Licence attribution in the app | `catalogue_sources.attribution_text`, shown on Pin Detail |

## Licence rules (Data & Image License Agreement v1.3)

- **Attribution, visible to collectors:** "Pin data provided by Pin & Pop (pinandpop.com)".
  It's stored in `catalogue_sources.attribution_text` and shown on Pin Detail.
- **Images are internal only.** `cover_image` is never shown to collectors
  and never copied into our storage. It's stored only as a `pin_images` row with
  `image_type = 'reference'`, `public_display_allowed = false`, `uploaded_by = null`.
  The 042 check constraint enforces that for `source = 'pin_and_pop'`, and RLS
  hides those rows from everyone but admins. `pins.image_url` stays null until a
  collector contributes a photo. If you need to show a pin, link to its P&P page
  (`pins.source_url`).
- **No redistribution.** Nothing exports the dataset. Don't add bulk exports or
  public APIs that return it wholesale.
- **No paywall-only use.** Catalogue data must stay free to view.

## Identity

`pinhunt_id = PHUK-` + (10,000,000 + P&P id), e.g. P&P 1 → `PHUK-10000001`.

- Re-imports and syncs are idempotent upserts on `pinhunt_id`.
- No collision with ids from `next_pinhunt_id()`, which are far below 10,000,000.
- Zero-padded, so `order by pinhunt_id desc` gives the highest P&P id (that's how the sync finds where to resume).
- `pins.external_identifiers.pin_and_pop` and `pin_external_ids (source='pin_and_pop')` also hold the P&P id.

## Field mapping

| P&P | PinHunt |
|---|---|
| `name` | `pins.title` |
| `series` | `pins.collection` (`""` when none: the app shows "Uncategorised") |
| `series_url` slug | `pins.normalised_series = 'pin_and_pop \| <slug>'` and `pin_sets.normalised_series` (one set per series URL: two P&P sets share a name) |
| `origin` | `pins.origin`, `pins.retailer` |
| `edition` OE / LR / LE / LE n | `edition_type` Open Edition / Limited Release / Limited Edition, `limited_edition_size` n |
| `release_year` | `release_year` (null if not 4 digits) |
| `url` | `pins.source_url` |
| `cover_image` | reference-only `pin_images` row (see licence) |
| whole record | `pins.raw_import_data` |
| — | `brand = 'Disney'`, `verification_status = 'verified'`, `catalogue_status = 'active'`, `is_searchable = true`, `catalogue_source = 'pin_and_pop'` |

## Running it

All commands run from `artifacts/api-server`. They need `--env-file=.env.staging`
and refuse any project that isn't staging (`scripts/lib/staging-guard.mjs`).
**Never point them at `.env`: that file is production.**

```bash
# 1. Back up (JSON of every table, outside git): see "Backup" below.
# 2. Validate the CSV (writes nothing)
node --env-file=.env.staging scripts/import-pinandpop.mjs csv ~/Downloads/pins-2026-11-11-212426.csv
# 3. Remove the old catalogue (refuses once P&P pins exist)
node --env-file=.env.staging scripts/import-pinandpop.mjs reset-old --apply
# 4. Import (≈3 minutes for 116k pins)
node --env-file=.env.staging scripts/import-pinandpop.mjs csv ~/Downloads/pins-2026-11-11-212426.csv --apply
# 5. Catch up from the API
node --env-file=.env.staging scripts/import-pinandpop.mjs sync --apply
```

### Sync

The API only filters by `id_after` / `added_after`, so there are two kinds of sync:

- **Incremental (new pins):** `sync --apply`, or `POST /api/admin/catalogue/pinandpop/sync`
  (App Creator, body `{ "maxPages": 1–25 }`, 200 pins a page; call again while
  `complete` is false). It resumes from the highest stored P&P id. Run daily.
- **Full refresh (edits and removals):** `sync --full --apply` re-reads every pin
  (~585 requests, ~10 minutes). It upserts edits and **archives** pins the API no
  longer returns (`catalogue_status='archived'`, `is_searchable=false`). It never
  deletes them, because collectors may own them. If the API returns under 90% of
  stored pins, it refuses to archive anything. Run weekly. Without `--apply` it
  only reports.

Rate limit and retries (in `createPinAndPopClient`): one request a second (the
documented limit is 60/min, though the API advertises 120). It waits
`Retry-After` (else 60 s) on 429 and backs off exponentially on 5xx and network
errors, up to 5 retries. 401, 403 and 422 fail at once. The token never leaves the
server, and errors returned to the app never include Pin & Pop's response body.

`GET /api/admin/catalogue/pinandpop/status` shows the stored count, highest id and
whether a token is configured.

### Environment

| Var | Where | Notes |
|---|---|---|
| `PINANDPOP_API_TOKEN` | api-server only (`.env.staging` now; Render later) | Never in `artifacts/pinhunt`. |

### Backup

Before the reset, every PostgREST-visible table on staging was dumped to JSON:
`~/PinHunt-Private/staging/pinandpop-pre-reset-20261111-2149/` (60 tables plus
`_manifest.json`). Storage files weren't touched.

## Staging results (11 Nov 2026)

**Imported:** 116,502 pins from the CSV, plus 1 from the API (P&P 130584) = **116,503**.
12,987 sets, 112,432 set memberships, 116,503 external ids, 116,503 reference
images (0 public). The CSV import took 165 s. A second incremental sync wrote 0 pins.
A full-refresh dry run (584 requests, ~10 min, no 429s) got 116,500 pins back from the
API. So 3 pins from the CSV export are no longer in the API (removed or merged since the
export). Running `sync --full --apply` would archive them. Nothing was archived yet.

**Removed:** the old 3,160 pins (2,977 CTP, 182 trusted test, 1 import), 326
sets, and by cascade 5,287 CTP images, 2,918 memberships, 7,907 external ids,
~640 market rows and 194 character links. Also 34 test collection entries and
3 boards (decided: back up, then delete). There were no contributed photos
(`uploaded_by` was null on every image) and no trades. Auth users, profiles (5),
settings and the 1 pending submission were kept.

**Data quality (CSV):**

- 116,502 rows, all valid, ids unique, nothing skipped.
- 4,070 pins have no series. 644 more sit in P&P's catch-all "Unknown Series".
- 3,983 pins have no release year, 1,963 no edition, 584 no origin. 1,425 are LE with no size.
- 1,113 groups (2,494 pins) share a name within one set (e.g. "Chip" in Pin
  Trader's Delight). They have different ids and images, so they're kept as
  separate pins. Duplicate review will need the image.
- 2 set names belong to two different P&P series. Sets are keyed by series URL, so they stay separate.
- No character data, no SKU, no price.
- Only 6,171 pins are Disneyland Paris or Disney Store UK origin. Most are US or Asian parks.

## Core functionality on staging (11 Nov 2026)

Measured with the app's anon key unless noted. API tests: 1,145 of 1,145 pass.
App tests: every suite passes except two scan suites (26 tests). Those fail with
"Element type is invalid" because `components/scan/` has both `ScanResult.tsx`
and `scanResult.ts`, which clash on macOS. This branch doesn't touch scan files.
Under full parallel load six other suites time out, and all of them pass when run alone.

| Area | Result |
|---|---|
| Pin detail (`getPinById`) | OK, ~45 ms. No image (by licence), attribution line shown. |
| Sets (`getPinsBySeries`, `getSetSummaries([name])`) | OK, 60–500 ms. **Fixed here:** `getSetSummaries()` returned only the first 1,000 of 12,987 sets, so set totals vanished for most sets. Callers now pass the set names they need. Add Pin uses the new `getAllSetNames()`. |
| Collections / ISO / For Trade | No schema changes. `user_pins` and boards key on `pins.id` / `pinhunt_id`, both present. Not exercised with a signed-in user (needs a test login). |
| Search | Before: 0.7–2.3 s, and "Stitch" timed out (anon 3 s limit). After 075 + 076: "Stitch" 115 ms, "Haunted Mansion" 97 ms, no hits 49 ms, a "mickey" page with its 16,018 total 280–435 ms. Results match the old query exactly. |
| Scan candidate search | After 075 + 076: character search 57 ms, 3 parallel word searches 250 ms in total (was ~2 s). The character search finds 0 because P&P has no characters. |
| Scanning | Candidate search is fast now (see above). The character search finds nothing (P&P has no character data). Visual verification has no catalogue images to compare against, because P&P images are reference-only. |
| Browse Catalogue | Was **43 s** (downloaded all 116k rows). **Now paged on the server** (`getCatalogueBrowsePage` + `utils/catalogueBrowsePager.ts`). Opening takes ~0.6 s warm; the first open in a fresh session takes up to 2 s while the connection is set up. Searches open in 0.2–0.4 s, a set in 80 ms, a year or edition in under 0.3 s, and each further page 0.1–0.25 s. Search, set, year and edition run on the server (search uses 076). A page never ends mid-set, so set counts and Select all stay right. Uncategorised (4,070) comes last. A typed 4-digit year acts as the year filter. The Set filter loads its 12,985 names when opened (~1.3 s). |
| Valuations | Unchanged code path (eBay by title). Old market rows were removed with the old pins. P&P has no prices. |
| Trading | No trades existed. Trades reference `pins.id` / `user_pins`, so no change is needed. |
| Contributions | Workflow unchanged. P&P reference rows have `uploaded_by = null`, so they stay out of the contribution queue (042). |
| Licence | 0 P&P images visible to collectors (RLS checked with the anon key). Attribution text is in place. |

## Known issues / next steps

1. **Search: fixed on staging with 075 + 076** (both applied 11 Nov 2026). 075 alone
   didn't help collectors: RLS on `pins` stops Postgres using the trigram indexes for
   `ilike`, which isn't leakproof. 076 adds `search_catalogue_pins()`, which
   `searchPins` / `searchPinsPage` call for text and character matching. It applies
   the pins RLS visibility rule itself, once per call. Without 076 the app falls back
   to the table query.
2. **Browse Catalogue** is paged now (see the table). Still open: for photo contributors only, the screen also loads
   `useCatalogueCoverage`, which fetches every pin's photo status (116k rows). That
   hook and its contributor screen need the same paging. Not measured.
3. **Scan accuracy:** P&P has no characters. Decide whether scan verification
   may compare against P&P reference images internally. The licence allows internal
   processing such as reverse image search, but sending them to OpenAI is a call
   for you to make.
4. The api-server `.env.staging` `SUPABASE_ANON_KEY` is rejected by staging
   ("Invalid API key"), so local `start:staging` auth checks fail. Copy the
   app's staging anon key into it. Check Render's value too.
5. Attribution is on Pin Detail only. Consider a line on Catalogue / search lists too.

## Production rollout (not done)

Do this only once staging is signed off. It's a separate, approved session, and it
must not overlap any other production work.

1. **Back up production**: a JSON dump of every table (as above), plus the Supabase dashboard backup.
2. **Schema:** apply 075 then 076, each with a production guard in place of the staging one
   (e.g. `if exists (select 1 from storage.buckets where id = 'pinhunt-staging-marker') then raise exception`).
   Both are additive (indexes; one function). No other migration is needed: P&P uses
   existing columns and tables (042/037).
3. **Decide what happens to production's user data on old pins.** Unlike staging,
   real collections, boards, trades and contributed photos will reference the old
   catalogue. `reset-old` deletes collection entries and refuses nothing else, so
   **don't run it on production as-is**. Either remap old pins to P&P (by
   `external_identifiers.pin_and_pop`, which the 182 trusted pins already carry)
   or archive the old pins (`catalogue_status='archived'`, `is_searchable=false`)
   so owners still see them.
4. **Import:** the scripts are staging-only by design. For production, add a separate,
   explicitly approved entry point with its own guard, not a flag on these scripts.
5. **Server:** add `PINANDPOP_API_TOKEN` to the production API service (none
   exists yet: Render `pin-hunt-uk` is staging). Schedule the incremental sync daily
   and the full refresh weekly.
6. **App:** ship the attribution and set-summary changes before or with the catalogue switch.
