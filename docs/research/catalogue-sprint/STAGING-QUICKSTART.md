# Staging quickstart: first verified pins into staging

About 1½ hours, most of it the page checks in step 6. Staging only: nothing here touches production.
Keep three terminal tabs open: **A** (commands), **B** (API), **C** (app).

## Before you start (from your phone, optional but saves a reload)
Send Claude your calls on the 5 held pins (`pilot-dsuk-high/README.md`, *Decisions for you*). Claude rebuilds the pilot, then you load it once.

## 1. Get the code (tab A, 3 min)
```sh
cd ~/path/to/Pin-hunt-uk
git fetch origin
git checkout claude/catalogue-research-sprint1   # includes everything on main
git pull
pnpm install --frozen-lockfile
```

## 2. Env files (5 min, skip if they already exist)
```sh
cp -n artifacts/api-server/.env.staging.example artifacts/api-server/.env.staging
cp -n artifacts/pinhunt/.env.staging.example   artifacts/pinhunt/.env.staging
```
Fill them from the **staging** project in the Supabase dashboard (Project Settings → API, and Connect → Session pooler for the host):
- `artifacts/api-server/.env.staging`: `STAGING_PROJECT_REF`, `PRODUCTION_PROJECT_REF`, `STAGING_DB_HOST`, `PRODUCTION_DB_HOST`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Leave the paid-API keys blank.
- `artifacts/pinhunt/.env.staging`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (anon key only), `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api`.

Check it points at staging:
```sh
pnpm --filter @workspace/api-server run staging:check
```
If this fails, stop and send Claude the output (no keys).

## 3. Migration 045 (Supabase SQL editor, 5 min)
1. Open the **staging** project. Its ref (in the URL) must equal `STAGING_PROJECT_REF`.
2. New query: paste all of `supabase/migrations/045_catalogue_research_staging.sql` → **Run**.
3. New query: `notify pgrst, 'reload schema';` → **Run**.
4. New query: paste all of `supabase/verify/045_verify.sql` → **Run**. Expect one row: **ALL 045 CHECKS PASSED**.
   If not: stop, copy the output, run the *Rollback* block at the end of the migration file, and send Claude the output.

## 4. Start the API and the app (5 min)
Tab B:
```sh
pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/api-server run start:staging
```
Tab C:
```sh
pnpm --filter @workspace/pinhunt run dev:staging
```
Press **w** to open it in the browser. Sign in with your **App Creator** account on staging.

## 5. Smoke test (3 min)
- Go to `http://localhost:8081/admin/research-review`. It shows "No runs".
- Admin → a pin → change its title → Save. It saves. (Change it back.)

## 6. Load and check the pilot (about 50 min)
1. Research Review → **Load research run (JSON)** → `docs/research/catalogue-sprint/pilot-dsuk-high/pilot_dsuk_high_payload.json`. The preview shows 100 pins, 22 sets → **Load run**.
2. Open `docs/research/catalogue-sprint/pilot-dsuk-high/pilot_dsuk_high_checklist.xlsx`. For each of the 23 rows:
   1. Open the Disney Store link in your browser.
   2. Research Review → **Review set** → paste the link → tick **only** the pins the page shows and the fields you could see (name/characters; edition size, price or date if shown) → **Record set check**.
   3. Multi-character pins: check the page shows **one pin** with those characters, not separate pins.
   4. **Approve ticked pins**. Rows marked "Review on its own": approve one at a time with a short note.
   5. Anything the page doesn't support: **Needs more research** or **Reject**.

## 7. Import the approved pins (tab A, 3 min)
API (tab B) still running:
```sh
node --env-file=artifacts/api-server/.env.staging research/catalogue-engine/tools/staging_import.mjs --dry-run
```
Sign in with the App Creator email and password (the password is not shown or stored). It lists what would be created and what is refused, and why. Nothing is written.

Then the real run:
```sh
node --env-file=artifacts/api-server/.env.staging research/catalogue-engine/tools/staging_import.mjs
```
Type `IMPORT <n>` when asked. It imports in batches of 50, all-or-nothing per batch, and saves a log in your home folder.

## 8. Confirm (2 min)
- Run the SQL line the import prints in the staging SQL editor. Every row must be `needs_source_verification`: **0 public**.
- In the app, search for one imported pin name. It should **not** appear.
- Send Claude: pins approved / rejected / needs research, the import summary line, and anything odd.

## If something goes wrong
- **Import refused (409):** nothing was written. Run the `--dry-run` again to see why.
- **Remove an imported batch:** `docs/research/research-import-design.md` §7 (delete the batch's pins by `import_batch_id`, reset its candidates). Ask Claude first.
- **Never** use the spreadsheet importer or `import-trusted-catalogue.mjs` for research pins.
