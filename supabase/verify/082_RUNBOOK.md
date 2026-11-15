# Migration 082: apply runbook (staging first, then production)

Migration: `supabase/migrations/082_events_source_url_check.sql`. Verify: `supabase/verify/082_verify.sql` (and `081_verify.sql` again). Never applied by an agent.

Numbering: 081 (`081_events.sql`) is the latest on main. 082 needs 081 applied first. If 082 is taken by the time this merges, renumber the migration, the verify script and this runbook.

## Why

081's database check on `events.source_url` only required an `https://` prefix and a length limit. The app also rejects whitespace (`/^https:\/\/\S+$/i`). A row written outside the app, in the SQL editor or with the service role, could store a link the app would never accept, and collectors' apps would then open it. 082 makes the database rule the same as the app's (#633, from the security review of #627).

## What it changes

- Drops 081's check on `source_url` (Postgres named it, so 082 finds it by definition, not by name).
- Adds `events_source_url_https`: `source_url is null or (source_url ~* '^https://\S+$' and char_length(source_url) <= 500)`. It is added `not valid` and then validated.

No table, column, policy, grant or row changes. The app needs no change.

`082_verify.sql` also asserts what 081's read policy relies on: `is_admin()` is `SECURITY DEFINER` with a fixed `search_path`, anon and signed-in users can execute it, and it returns false when signed out, false for a collector and true for an admin.

## Pre-checks done (local PGlite replay, no hosted database)

- The chain replays with 081 and 082. The known `006_trade_ratings.sql` duplicate-policy failure was patched in a scratch copy only, and 075–077 stop on their staging guard, as expected. `082_verify.sql` prints `ALL 082 CHECKS PASSED`, `081_verify.sql` still prints `ALL 081 CHECKS PASSED`, and `081_seed.sql` still loads.
- The verify fails when it should:
  - 1c with 081's looser regex;
  - 1a with 082 not applied;
  - 2b with `is_admin()` changed to `security invoker`;
  - 2c with its `search_path` reset.
- 082 can be run twice. With a bad existing row, it stops at the validate step with `check constraint "events_source_url_https" … is violated by some row`.

## Staging

1. Pre-check for links the new rule would reject (read-only):
   ```sql
   select id, title, source_url from public.events
    where source_url is not null and not (source_url ~* '^https://\S+$' and char_length(source_url) <= 500);
   ```
   Expect no rows. If there are any, fix each link in Admin → Events, or clear it (`update public.events set source_url = null where id = '…';`).
2. Open `082_events_source_url_check.sql` from the raw file and run it in the staging SQL editor (check the project URL is staging).
3. Run `supabase/verify/082_verify.sql` as it is (`target := 'staging'`). Expect `ALL 082 CHECKS PASSED`. Then run `081_verify.sql`. Expect `ALL 081 CHECKS PASSED`.
4. Device check (optional): in Admin → Events, an https link still saves, and the event's "View event" still opens it.

## Production (after staging is signed off)

1. Back up production.
2. Run the pre-check from Staging step 1. Expect no rows; fix any first.
3. Both verify scripts insert test users into `auth.users` and `profiles` and roll them back. A trigger on those tables that acts outside the database (an email, a webhook, `net.http_*`) would still fire. List the triggers:
   ```sql
   select tgrelid::regclass as on_table, tgname, pg_get_triggerdef(oid)
     from pg_trigger
    where not tgisinternal
      and tgrelid in ('auth.users'::regclass, 'public.profiles'::regclass);
   ```
   If any of them calls out, don't run the verify scripts on production. Use these read-only checks instead:
   ```sql
   select conname, convalidated, pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.events'::regclass and pg_get_constraintdef(oid) like '%source_url%';
     -- one row: events_source_url_https, true, …'^https://\S+$'…
   select prosecdef, proconfig from pg_proc where oid = 'public.is_admin()'::regprocedure;
     -- true, {search_path=public}
   select has_function_privilege('anon', 'public.is_admin()', 'execute');   -- true
   ```
   **Project guard (#645):** both verify scripts start with `target text := 'staging'`. They stop before writing anything if the project's `pinhunt_environment()` marker says otherwise, or if the marker is missing. Only if the trigger check passes, change that line to `'production'` in each script for the production run. Otherwise leave it, and use the read-only checks.
4. Run 082 in the production SQL editor (check the project URL is production), then the verify (or the read-only checks).
5. Merge the PR by hand once production is verified.

## If the validate step fails

The error names `events_source_url_https`. The new rule is already in place for new and edited rows; only existing rows haven't been checked. Run the pre-check query, fix or clear the links it lists, then run 082 again (it is safe to re-run).

## Rollback

```sql
alter table public.events drop constraint if exists events_source_url_https;
alter table public.events add constraint events_source_url_check
  check (source_url is null or (source_url ~* '^https://' and char_length(source_url) <= 500));
notify pgrst, 'reload schema';
```
