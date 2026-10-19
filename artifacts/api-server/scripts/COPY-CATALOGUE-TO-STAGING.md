# Copying the public catalogue into staging (#372)

Preview and TestFlight builds read the **staging** Supabase project, which starts with no catalogue. That's why the app showed "No photo yet". `scripts/copy-catalogue-to-staging.mjs` copies main's **public catalogue** into staging, so preview builds have real pins and photos.

## What it copies, and what it never copies

**Copied:** catalogue sources, characters, categories, sets, verified and searchable pins, set memberships, pin characters and categories, external IDs, and pin image links that are allowed to be shown. Pin & Pop images and Pin & Pop external-ID links are never copied.

**Never copied:** sign-ins, profiles, collections, boards, community posts, messages, submissions, contributions waiting for review, admin or research data, or any files. Columns that point at a person (`submitted_by`, `uploaded_by`, `confirmed_by` and so on) are cleared, as is each pin's link to the private import record (`import_batch_id`). Images keep loading from main's public bucket.

**How it stays safe:**
- It reads main with main's **anon (public) key only**, so it can only see what any app user sees. It refuses a service-role or secret key.
- It writes to staging only after the staging guard passes.
- It never deletes anything.
- Re-running it updates the same rows rather than adding duplicates.
- If staging already has a pin with the same PinHunt ID under a different id, that pin is skipped, never overwritten. Characters, categories and sets that already exist in staging are reused.
- **Photos added or cleaned in staging are kept (#384).** If a staging pin's photo differs from main's (for example one cleaned with `clean-catalogue-images.mjs`, or added through the TestFlight app), a re-run keeps the staging photo, and the report says "kept N staging photo(s)". Add `--refresh-images` to take main's photos instead.

## Run it (from artifacts/api-server)

1. Add these two lines to `.env.staging`:
   ```
   MAIN_SUPABASE_URL=https://<your main project ref>.supabase.co
   MAIN_SUPABASE_ANON_KEY=<main's anon / publishable key>
   ```
   To find them, open the Supabase dashboard, go to your **main** project, then **Project Settings → API**. Copy the Project URL, then the `anon` `public` key (or the publishable key). Never use the `service_role` or secret key.

   The URL's project ref must match `PRODUCTION_PROJECT_REF`, which is already in the file.
2. Dry run. It reads only, and prints what it would write per table:
   ```
   node --env-file=.env.staging scripts/copy-catalogue-to-staging.mjs
   ```
3. If the counts look right, apply:
   ```
   node --env-file=.env.staging scripts/copy-catalogue-to-staging.mjs --apply
   ```
   It finishes with "N row(s) written, 0 failed". Any rows that fail are listed with the reason; the rest are still written.
4. Optional: run `pnpm --filter @workspace/api-server run staging:verify`. It reports the catalogue tables as expected, and lists any user tables that hold data.
5. Open the TestFlight app. Catalogue, Search and pin pages should now show photos.

Run it again any time to pick up catalogue changes from main.
