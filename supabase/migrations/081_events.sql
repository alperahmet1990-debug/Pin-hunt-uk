-- ============================================================
-- Migration 081: admin-managed events (#613)
--
-- STAGING FIRST. Apply in the Supabase SQL editor on staging, run
-- supabase/verify/081_verify.sql there, and only then (separately approved)
-- on production. Runbook: supabase/verify/081_RUNBOOK.md.
-- Never applied by an agent.
--
-- Needs 002 (is_admin()) and 001_schema (profiles). Nothing else.
--
-- Purely additive: 1 new table, 1 trigger function, 4 policies. No existing
-- table, column, policy or row is changed.
--
--   • events   the pin events Home's "What's Happening" and the /events page
--              show, replacing the list built into the app
--              (artifacts/pinhunt/mock-data/events.ts). Admins add, edit,
--              publish/unpublish and delete them in the app (/admin/events).
--
-- Who can do what:
--   • anyone (anon or signed in)   reads published events only
--   • admins (is_admin())          read every event, including drafts, and
--                                  insert, update and delete
--   • nobody else writes. created_by is always the inserting admin.
--
-- Optional seed of the events built into the app: supabase/verify/081_seed.sql.
-- Rollback at the bottom.
-- ============================================================

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  description   text not null default '' check (char_length(description) <= 1000),
  -- First day of the event. For a rumour (date not confirmed), the date it
  -- stops being shown.
  event_date    date not null,
  -- Multi-day events only.
  end_date      date,
  -- Free text, e.g. "7am–9:45am".
  time_text     text check (time_text is null or char_length(time_text) <= 60),
  location      text check (location is null or char_length(location) <= 120),
  country       text check (country is null or char_length(country) <= 60),
  -- e.g. "Store Pin Trading Event".
  event_type    text not null default 'Pin Event' check (char_length(btrim(event_type)) between 1 and 60),
  -- Short pill over the card, e.g. "UK EVENT".
  badge_label   text not null default 'EVENT' check (char_length(btrim(badge_label)) between 1 and 24),
  -- Where the details come from; "View event" opens source_url.
  source_name   text check (source_name is null or char_length(source_name) <= 80),
  source_url    text check (source_url is null or (source_url ~* '^https://' and char_length(source_url) <= 500)),
  -- Pinned to the front of the list.
  featured      boolean not null default false,
  -- Talked about but not dated: shown last, with when_text instead of a date.
  rumour        boolean not null default false,
  when_text     text check (when_text is null or char_length(when_text) <= 60),
  -- Drafts are visible to admins only.
  published     boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint events_end_after_start check (end_date is null or end_date >= event_date)
);

create index if not exists events_published_date on public.events (event_date) where published;

create or replace function public.events_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- created_by and created_at never change after insert.
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before insert or update on public.events
  for each row execute function public.events_set_updated_at();

alter table public.events enable row level security;

drop policy if exists "events_select_published" on public.events;
create policy "events_select_published" on public.events
  for select to anon, authenticated
  using (published or public.is_admin());

drop policy if exists "events_insert_admin" on public.events;
create policy "events_insert_admin" on public.events
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "events_update_admin" on public.events;
create policy "events_update_admin" on public.events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "events_delete_admin" on public.events;
create policy "events_delete_admin" on public.events
  for delete to authenticated
  using (public.is_admin());

revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (run by hand only; deletes every event row):
--
--   drop table if exists public.events;
--   drop function if exists public.events_set_updated_at();
--   notify pgrst, 'reload schema';
--
-- The app keeps working after a rollback: Home and /events show community
-- event posts only (no curated events) until 081 is re-applied.
-- ============================================================
