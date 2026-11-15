# Migration 081: apply runbook (staging first, then production)

Migration: `supabase/migrations/081_events.sql`. Verify: `supabase/verify/081_verify.sql`. Optional seed: `supabase/verify/081_seed.sql`. Never applied by an agent.

Numbering: 080 (`080_contributed_image_raw.sql`) is the latest on main. 081 depends only on 001_schema (`profiles`) and 002 (`is_admin()`). If 081 is taken by the time this merges, renumber the migration, the verify script, the seed and this runbook.

## Why

Home's "What's Happening" and the `/events` page showed a list of events built into the app (`artifacts/pinhunt/mock-data/events.ts`), so every new event needed an app release (#613). With 081, events live in a table and admins manage them in the app: **Admin → Events** (add, edit, publish/unpublish, delete).

## What it changes (all additive)

- New table `public.events`: title, description, start/end date, time, location, country, event type, badge, source name and https link, featured, rumour + rough date, published, created_by, timestamps. Check constraints mirror the app's validation (lengths, end ≥ start, https-only links).
- Trigger `events_set_updated_at`: keeps `updated_at` current and stops `created_by`/`created_at` changing after insert.
- RLS, 4 policies:
  - `events_select_published`: anon and signed-in users read **published** rows; admins (`is_admin()`) also read drafts.
  - `events_insert_admin`: admins only, and `created_by` must be the inserting admin.
  - `events_update_admin`, `events_delete_admin`: admins only.
- Grants: `select` to anon/authenticated; `insert, update, delete` to authenticated (still gated by the admin-only policies). anon can't write.

No existing table, column, policy or row is touched.

Before 081 is applied, the new app code still works: Home and `/events` show community event posts only (no curated events), and Admin → Events says "Events aren't set up on this server yet (migration 081)". Apply 081 and run the seed **before** shipping a build with this PR, or Home loses its curated events until you do.

## Pre-checks done (local PGlite replay, no hosted database)

- The chain replays with 081 (the known `006_trade_ratings.sql` duplicate-policy failure patched in a scratch copy only; 075–077 stop on their staging guard, as expected). `081_verify.sql` prints `ALL 081 CHECKS PASSED`, before and after the seed, and the seed is idempotent (run twice: 7 published events both times on 15 Nov 2026).
- Loosening the read policy to `using (true)` makes the verify fail (1d); opening insert to anon with `with check (true)` makes it fail (1e). So it does catch a leak.

## Staging

1. Open `081_events.sql` from the raw file (GitHub "Raw" or a local checkout) and copy the whole file.
2. Staging Supabase SQL editor (check the project URL is staging): run it.
3. Run `supabase/verify/081_verify.sql`. Expect one row: `ALL 081 CHECKS PASSED`. It writes two test users and test events and rolls them back (see "Production", step 3, on triggers).
4. Optional: run `supabase/verify/081_seed.sql` to copy the events built into the app (those that haven't ended) into the table, published. It prints the number of published events.
5. The migration ends with `notify pgrst, 'reload schema';`. Run that again if the app reports it can't find the `events` table.
6. Device check (a build pointed at staging):
   - Home → What's Happening shows the seeded events; See all → the same events grouped by when.
   - Profile → Admin → Events: add an event as a draft → it isn't on Home. Publish it → pull to refresh on What's Happening, it's there. Edit the title → the new title shows. Unpublish → gone. Delete → asks first, then gone.
   - Signed in as a non-admin: Admin isn't reachable, and Home shows published events only.

## Production (after staging is signed off)

1. Back up production (Supabase dashboard backup).
2. Spot-check what 081 builds on:
   ```sql
   select to_regprocedure('public.is_admin()') is not null;   -- true (002)
   select to_regclass('public.events') is null;              -- true (no clash)
   ```
3. Before the verify script: `081_verify.sql` is **not read-only**. It inserts two test users into `auth.users` and `profiles`, then rolls them back. A trigger that acts outside the database (an email, a webhook, `net.http_*`) would still fire. List the triggers:
   ```sql
   select tgrelid::regclass as on_table, tgname, pg_get_triggerdef(oid)
     from pg_trigger
    where not tgisinternal
      and tgrelid in ('auth.users'::regclass, 'public.profiles'::regclass);
   ```
   If any of them sends email or calls out, **don't run the verify script on production**. Rely on the staging run and these read-only checks:
   ```sql
   select relrowsecurity from pg_class where oid = 'public.events'::regclass;            -- true
   select policyname, cmd, roles from pg_policies where tablename = 'events' order by 1; -- the 4 policies above
   select has_table_privilege('anon', 'public.events', 'insert');                         -- false
   ```
4. Production SQL editor (check the project URL is production): run 081, then the verify (or the read-only checks), then optionally the seed.
5. Merge the PR by hand once production is verified.

## Rollback

```sql
drop table if exists public.events;
drop function if exists public.events_set_updated_at();
notify pgrst, 'reload schema';
```

This deletes every event row. The app keeps working: Home and `/events` fall back to community event posts only. To undo just the seed: `delete from public.events where created_by is null;` (seeded rows are the only ones without an author, unless an admin's account was deleted).
