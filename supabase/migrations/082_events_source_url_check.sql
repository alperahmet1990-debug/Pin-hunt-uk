-- ============================================================
-- Migration 082: events link check matches the app (#633)
--
-- STAGING FIRST. Apply in the Supabase SQL editor on staging, run
-- supabase/verify/082_verify.sql there, and only then (separately approved)
-- on production. Runbook: supabase/verify/082_RUNBOOK.md.
-- Never applied by an agent.
--
-- Needs 081 (events) applied first.
--
-- 081 checked events.source_url with only an https:// prefix and a length
-- limit. The app (lib/pin-repository/src/events.ts) also rejects whitespace:
-- /^https:\/\/\S+$/i. A row written outside the app (SQL editor, service
-- role) could store a link the app would never accept, which clients then
-- open. This replaces the check with the app's rule.
--
-- Nothing else changes: no table, column, policy, grant or row.
--
-- Existing rows: the new check is added NOT VALID, then validated. A bad
-- existing link stops the validation with an error naming
-- events_source_url_https. Even then, the NOT VALID check already applies to
-- every new or edited row, so nothing unchecked can get in. The runbook's
-- pre-check lists any such row first: fix it, then re-run this file (safe
-- to re-run).
--
-- Rollback at the bottom.
-- ============================================================

do $$
declare
  c record;
begin
  if to_regclass('public.events') is null then
    raise exception '082 needs migration 081 (public.events) applied first. Nothing was changed.';
  end if;
  -- 081's check was declared inline on the column, so Postgres named it.
  -- Drop every check on events that mentions source_url, whatever its name.
  for c in
    select conname from pg_constraint
     where conrelid = 'public.events'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%source_url%'
  loop
    execute format('alter table public.events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.events
  add constraint events_source_url_https check (
    source_url is null or (source_url ~* '^https://\S+$' and char_length(source_url) <= 500)
  ) not valid;

alter table public.events validate constraint events_source_url_https;

notify pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (run by hand only): put back 081's looser check.
--
--   alter table public.events drop constraint if exists events_source_url_https;
--   alter table public.events add constraint events_source_url_check
--     check (source_url is null or (source_url ~* '^https://' and char_length(source_url) <= 500));
--   notify pgrst, 'reload schema';
-- ============================================================
