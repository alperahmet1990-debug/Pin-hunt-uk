-- ============================================================
-- Migration 052: catalogue review events (append-only audit log) (RR-DB1, #320)
--
-- STAGING FIRST. Apply in the Supabase SQL editor on staging, run
-- supabase/verify/052_verify.sql there, and only then (separately approved)
-- on production, followed by:  notify pgrst, 'reload schema';
-- Never applied by an agent.
--
-- Run AFTER 049. It depends only on 001–049 (profiles, pins, is_admin() from
-- 002, and the 045 research staging tables), not on 050 or 051, so it can be
-- applied before or after those.
--
-- Purely additive: 1 new table, 3 trigger functions, 3 triggers, 3 indexes.
-- No existing table, column, policy or row is changed or removed.
--
--   • catalogue_review_events  one row per review decision. The subject is a
--     research candidate (045), a catalogue pin, or both; an external record
--     (external_source + external_id) can be named for mapping decisions.
--     - Rows are never updated or deleted, by any role, including the
--       service role. The only change allowed is the automatic
--       `actor := null` when the actor's profile is deleted (account deletion).
--     - Deleting a candidate, run or pin that has events is refused
--       (on delete restrict), so the history cannot be removed indirectly.
--     - created_at is always the insert time; run_id is filled from the
--       candidate and must match it.
--     Read: admins (RLS). Write: API server only (service role), as 045.
--
-- Rollback at the bottom.
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────
create table if not exists catalogue_review_events (
  id               uuid        primary key default gen_random_uuid(),
  -- Subject: at least one of candidate_id / pin_id (check below).
  candidate_id     uuid        references catalogue_candidates(id) on delete restrict,
  run_id           uuid        references catalogue_research_runs(id) on delete restrict,
  pin_id           uuid        references pins(id) on delete restrict,
  external_source  text        check (external_source ~ '^[a-z0-9_]{2,40}$'),
  external_id      text        check (length(external_id) between 1 and 200),
  -- Who acted. Nullable so account deletion keeps the event and clears the link.
  actor            uuid        references profiles(id) on delete set null,
  action           text        not null check (action in (
                                 'direct_check', 'decision', 'correct', 'resolve', 'add_member', 'skip', 'import',
                                 'link_external', 'unlink_external', 'reject_match')),
  from_status      text        check (from_status ~ '^[a-z_]{2,40}$'),
  to_status        text        check (to_status ~ '^[a-z_]{2,40}$'),
  fields           text[]      not null default '{}' check (cardinality(fields) <= 100),
  market           text        check (length(market) between 1 and 40),
  source_url       text        check (source_url ~ '^https?://' and length(source_url) <= 2000),
  source_class     text        check (source_class in ('official', 'news', 'fan', 'unclassified', 'physical', 'none')),
  payload          jsonb       not null default '{}'::jsonb
                     check (jsonb_typeof(payload) = 'object' and length(payload::text) <= 20000),
  notes            text        check (length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  constraint review_event_has_subject check (candidate_id is not null or pin_id is not null),
  constraint review_event_external_pair check ((external_source is null) = (external_id is null)),
  -- Mapping decisions always name the catalogue pin and the external record.
  constraint review_event_external_action_subject check (
    action not in ('link_external', 'unlink_external', 'reject_match')
    or (pin_id is not null and external_source is not null))
);

create index if not exists catalogue_review_events_candidate_idx on catalogue_review_events (candidate_id, created_at);
create index if not exists catalogue_review_events_run_idx       on catalogue_review_events (run_id, created_at);
create index if not exists catalogue_review_events_pin_idx       on catalogue_review_events (pin_id, created_at);

-- ── 2. Insert: server time, run_id consistent with the candidate ─────────────
create or replace function catalogue_review_events_before_insert() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare cand_run uuid;
begin
  new.created_at := now();
  if new.candidate_id is not null then
    select run_id into cand_run from catalogue_candidates where id = new.candidate_id;
    if new.run_id is null then
      new.run_id := cand_run;
    elsif cand_run is not null and new.run_id <> cand_run then
      raise exception 'catalogue_review_events: run_id does not match the candidate''s run'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists catalogue_review_events_insert on catalogue_review_events;
create trigger catalogue_review_events_insert before insert on catalogue_review_events
  for each row execute function catalogue_review_events_before_insert();

-- ── 3. Append-only: no update, delete or truncate, for any role ──────────────
-- The single exception is the foreign-key action from profiles (on delete set
-- null): it runs nested inside the profile delete (pg_trigger_depth() > 1) and
-- changes nothing but actor -> null.
create or replace function catalogue_review_events_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE'
     and pg_trigger_depth() > 1
     and old.actor is not null and new.actor is null
     and (to_jsonb(new) - 'actor') = (to_jsonb(old) - 'actor') then
    return new;
  end if;
  raise exception 'catalogue_review_events is append-only (% refused)', lower(tg_op);
end $$;

drop trigger if exists catalogue_review_events_no_change on catalogue_review_events;
create trigger catalogue_review_events_no_change before update or delete on catalogue_review_events
  for each row execute function catalogue_review_events_append_only();

create or replace function catalogue_review_events_no_truncate() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'catalogue_review_events is append-only (truncate refused)';
end $$;

drop trigger if exists catalogue_review_events_no_truncate on catalogue_review_events;
create trigger catalogue_review_events_no_truncate before truncate on catalogue_review_events
  for each statement execute function catalogue_review_events_no_truncate();

revoke all on function catalogue_review_events_before_insert() from public, anon, authenticated;
revoke all on function catalogue_review_events_append_only() from public, anon, authenticated;
revoke all on function catalogue_review_events_no_truncate() from public, anon, authenticated;

-- ── 4. RLS and grants (as 045): admins read; writes are service role only ────
alter table catalogue_review_events enable row level security;

drop policy if exists catalogue_review_events_read on catalogue_review_events;
create policy catalogue_review_events_read on catalogue_review_events for select using (is_admin());

revoke all on catalogue_review_events from public, anon, authenticated;
grant select on catalogue_review_events to authenticated;
-- No insert/update/delete policies: events are written by the API server
-- (service role) behind requireAppCreator. Route changes come later (RR-14).

-- ── Rollback (run in this order; drops only what this file created) ─────────
-- Dropping the table discards every recorded event: export it first if needed.
-- drop table if exists catalogue_review_events;
-- drop function if exists catalogue_review_events_no_truncate();
-- drop function if exists catalogue_review_events_append_only();
-- drop function if exists catalogue_review_events_before_insert();
-- notify pgrst, 'reload schema';
