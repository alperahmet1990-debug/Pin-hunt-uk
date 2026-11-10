# 073 age confirmation: apply runbook

Migration: `supabase/migrations/073_age_confirmation.sql` (LP-8 #530, plus the admin function LP-9 #531 uses).
Verification: `supabase/verify/073_verify.sql` (one transaction, rolled back; expect `ALL 073 CHECKS PASSED`).

Never applied by an agent. The maintainer applies it in the Supabase SQL editor.

## One-time: the project marker

Both files start with a guard that compares the `target` you type with `pinhunt_environment()` and stops on a mismatch, so a paste into the wrong project changes nothing. Create the marker once in each project (later migrations can reuse it):

```sql
-- In the STAGING project only:
create or replace function public.pinhunt_environment() returns text
language sql immutable as $$ select 'staging' $$;
revoke all on function public.pinhunt_environment() from public, anon, authenticated;
```

```sql
-- In the PRODUCTION project only:
create or replace function public.pinhunt_environment() returns text
language sql immutable as $$ select 'production' $$;
revoke all on function public.pinhunt_environment() from public, anon, authenticated;
```

Check which project the editor is on before creating each marker. After that, the guard does the checking.

## Release order

The app update adds the Confirm age and "PinHunt is for adults" screens. Builds without it don't know about the check, and an app build with it treats a missing `get_my_age_status()` as "no check yet", so neither order locks anyone out. Still:

1. **Staging.** Leave `target := 'staging'` in both files. Apply `073_age_confirmation.sql`. Run `073_verify.sql`. Expect `ALL 073 CHECKS PASSED`. The migration ends with `notify pgrst, 'reload schema';`; run it again if the app reports a schema cache error.
2. Test the app against staging (device checks in the PR).
3. **Production**, only when the app update is ready to ship (older builds have no Confirm age screen): set `target := 'production'` in both files, apply, verify, reload the schema cache.

Every existing account starts with neither column set, so each collector is asked once, at their next sign-in, after the app update.

## Pre-checked locally

Replayed with `supabase/verify/local-replay.mjs` (PGlite, no hosted database): `ALL 073 CHECKS PASSED`. Controls: granting `select (age_declined_at)` to `authenticated` makes check 1b fail; a marker that says `production` stops the guard. (The replay currently needs a `rollback` after a failed file to get past the existing 006/058 stub gap; that is unrelated to 073.)

## Rollback

At the bottom of the migration. It drops both columns, so every confirmation and decline is lost; the export query is there too. App builds with this change keep working without the functions.
