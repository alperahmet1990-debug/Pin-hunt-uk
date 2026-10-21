-- ============================================================
-- Migration 055: market data retention by source, per-source summaries and
-- valuation history (SG-12, #446)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/055_verify.sql there, and only then
-- (separately approved) on production, followed by:
--   notify pgrst, 'reload schema';
--
-- Run AFTER 054 (it depends on 049 and 054; 050–053 are not required).
-- Safe to run more than once. Rollback at the bottom.
--
-- Retention policy (maintainer, 21 Oct 2026; docs/market-data/RIGHTS.md §5):
-- historical market data is not deleted automatically because of its age.
-- Soldgraph sets no retention limit. eBay Browse API data keeps its
-- configured limit, because eBay's API licence is separate.
--
-- Additive, plus three behaviour changes to 049 objects. No row is deleted
-- and no grant or policy is widened.
--
--   • market_sources.retention_days may be NULL, meaning "no age-based
--     expiry". The 1..365 CHECK still applies to every non-NULL value.
--     Soldgraph sources (provider = 'soldgraph') are set to NULL. Every other
--     source, including ebay_browse:*, keeps its current value. New sources
--     still default to 30.
--   • market_listings.expires_at may be NULL. The expiry trigger sets NULL
--     for rows of a NULL-retention source; for every other source it works
--     exactly as in 049. Existing rows of NULL-retention sources get NULL.
--   • purge_market_listings(): the age-based purge never deletes rows of a
--     NULL-retention source. purge_market_listings('<source>', true) still
--     deletes every row of that one source (a deliberate maintainer action).
--     Same signature, so existing grants stay.
--   • market_valuations.source_summaries: derived per-source figures (count,
--     latest date, median, low/high). Allowed keys only, as for `sources`:
--     no titles, links, images or seller data. Defaults to [].
--   • market_valuation_history: append-only, one row per recalculation per
--     (pin, market). market_valuations stays the "current" row. Service
--     role only (narrower than market_valuations, which signed-in users can
--     read). Rows cannot be updated or deleted, except by the cascade when
--     the pin itself is deleted (same as market_valuations).
-- ============================================================

-- ── 1. Sources: NULL retention = no age-based expiry ─────────────────────────
alter table market_sources alter column retention_days drop not null;
-- The 049 CHECK (retention_days between 1 and 365) is kept: NULL passes it,
-- any other value must still be within range.

comment on column market_sources.retention_days is
  'Days raw listing rows from this source are kept after last seen (1..365). NULL = no age-based expiry (Soldgraph, 055).';

-- Soldgraph sets no retention limit (RIGHTS.md §1). Re-running this sets the
-- Soldgraph sources back to NULL; other sources are never touched.
update market_sources
set retention_days = null, updated_at = now()
where provider = 'soldgraph' and retention_days is not null;

-- ── 2. Listings: expires_at only where the source has a limit ────────────────
alter table market_listings alter column expires_at drop not null;

comment on column market_listings.expires_at is
  'last_seen_at + the source''s retention_days, set by trigger. NULL when the source has no age-based expiry (055).';

create or replace function market_listings_set_expiry() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_days integer;
  cap    timestamptz;
begin
  select s.retention_days into v_days from market_sources s where s.id = new.source_id;
  if not found then
    return new;  -- unknown source: the foreign key rejects the row
  end if;
  if v_days is null then
    new.expires_at := null;  -- no age-based expiry for this source
    return new;
  end if;
  cap := new.last_seen_at + make_interval(days => v_days);
  if tg_op = 'UPDATE' and new.last_seen_at is distinct from old.last_seen_at then
    new.expires_at := cap;
  else
    new.expires_at := least(coalesce(new.expires_at, cap), cap);
  end if;
  return new;
end $$;

-- Existing rows of NULL-retention sources: clear expires_at (the trigger
-- above also enforces this on the update).
update market_listings l
set expires_at = null
from market_sources s
where s.id = l.source_id and s.retention_days is null and l.expires_at is not null;

-- Delete path for raw listing rows.
--   purge_market_listings()                     expired rows, sources with a limit
--   purge_market_listings('<source>')           expired rows, that source (none if it has no limit)
--   purge_market_listings('<source>', true)     EVERY row of that source, whatever its limit
-- "Expired" also honours a retention_days that has since been shortened.
create or replace function purge_market_listings(p_source_id text default null, p_all boolean default false)
returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if p_all then
    if p_source_id is null then
      raise exception 'purge_market_listings: p_all requires p_source_id' using errcode = 'invalid_parameter_value';
    end if;
    delete from market_listings where source_id = p_source_id;
  else
    delete from market_listings l
    using market_sources s
    where s.id = l.source_id
      and s.retention_days is not null
      and (p_source_id is null or l.source_id = p_source_id)
      and ((l.expires_at is not null and l.expires_at <= now())
           or l.last_seen_at + make_interval(days => s.retention_days) <= now());
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 3. Per-source summaries on the current valuation ─────────────────────────
-- [{ "source_id", "provider", "evidence_type": "sold"|"active", "count",
--    "latest_date", "median", "low", "high" }] and nothing else. One entry per
-- source id: sources are never merged.
alter table market_valuations
  add column if not exists source_summaries jsonb not null default '[]'::jsonb
    constraint market_valuation_source_summaries_check check (
      jsonb_typeof(source_summaries) = 'array' and length(source_summaries::text) <= 4000
      and not jsonb_path_exists(source_summaries, '$[*] ? (@.type() != "object")')
      and not jsonb_path_exists(source_summaries,
        '$[*].keyvalue() ? (@.key != "source_id" && @.key != "provider" && @.key != "evidence_type" && @.key != "count" && @.key != "latest_date" && @.key != "median" && @.key != "low" && @.key != "high")')
      and not jsonb_path_exists(source_summaries, '$[*] ? (@.evidence_type != "sold" && @.evidence_type != "active")'));

comment on column market_valuations.source_summaries is
  'Derived per-source figures (count, latest date, median, low/high). No listing detail (055).';

-- ── 4. Valuation history (append-only) ───────────────────────────────────────
create table if not exists market_valuation_history (
  id                uuid          primary key default gen_random_uuid(),
  pin_id            uuid          not null references pins(id) on delete cascade,
  market            text          not null check (market in ('UK', 'US', 'FR')),
  currency          text          not null check (currency ~ '^[A-Z]{3}$'),
  low               numeric(10,2) check (low >= 0),
  fair              numeric(10,2) check (fair >= 0),
  high              numeric(10,2) check (high >= 0),
  sold_count        integer       not null default 0 check (sold_count >= 0),
  active_count      integer       not null default 0 check (active_count >= 0),
  confidence_score  smallint      not null default 0 check (confidence_score between 0 and 100),
  confidence_band   text          not null check (confidence_band in ('insufficient', 'low', 'medium', 'high')),
  -- Same restricted shapes as market_valuations.sources / source_summaries.
  sources           jsonb         not null default '[]'::jsonb
                      check (jsonb_typeof(sources) = 'array' and length(sources::text) <= 4000
                             and not jsonb_path_exists(sources, '$[*] ? (@.type() != "object")')
                             and not jsonb_path_exists(sources,
                               '$[*].keyvalue() ? (@.key != "source_id" && @.key != "count" && @.key != "latest_date")')),
  source_summaries  jsonb         not null default '[]'::jsonb
                      check (jsonb_typeof(source_summaries) = 'array' and length(source_summaries::text) <= 4000
                             and not jsonb_path_exists(source_summaries, '$[*] ? (@.type() != "object")')
                             and not jsonb_path_exists(source_summaries,
                               '$[*].keyvalue() ? (@.key != "source_id" && @.key != "provider" && @.key != "evidence_type" && @.key != "count" && @.key != "latest_date" && @.key != "median" && @.key != "low" && @.key != "high")')
                             and not jsonb_path_exists(source_summaries, '$[*] ? (@.evidence_type != "sold" && @.evidence_type != "active")')),
  method_version    text          not null check (length(method_version) between 1 and 40),
  calculated_at     timestamptz   not null,
  created_at        timestamptz   not null default now(),
  constraint market_valuation_history_ordered check (
    (low is null or fair is null or low <= fair) and
    (fair is null or high is null or fair <= high) and
    (low is null or high is null or low <= high))
);
create index if not exists market_valuation_history_pin_idx
  on market_valuation_history (pin_id, market, calculated_at desc);

-- created_at is always the insert time.
create or replace function market_valuation_history_before_insert() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.created_at := now();
  return new;
end $$;

drop trigger if exists market_valuation_history_insert on market_valuation_history;
create trigger market_valuation_history_insert before insert on market_valuation_history
  for each row execute function market_valuation_history_before_insert();

-- No update, delete or truncate, for any role. The single exception is the
-- foreign-key cascade when the pin is deleted: it runs nested inside the pin
-- delete (pg_trigger_depth() > 1) and the pin no longer exists.
create or replace function market_valuation_history_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE'
     and pg_trigger_depth() > 1
     and not exists (select 1 from pins p where p.id = old.pin_id) then
    return old;
  end if;
  raise exception 'market_valuation_history is append-only (% refused)', lower(tg_op);
end $$;

drop trigger if exists market_valuation_history_no_change on market_valuation_history;
create trigger market_valuation_history_no_change before update or delete on market_valuation_history
  for each row execute function market_valuation_history_append_only();

create or replace function market_valuation_history_no_truncate() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'market_valuation_history is append-only (truncate refused)';
end $$;

drop trigger if exists market_valuation_history_no_truncate on market_valuation_history;
create trigger market_valuation_history_no_truncate before truncate on market_valuation_history
  for each statement execute function market_valuation_history_no_truncate();

-- ── 5. RLS and grants ────────────────────────────────────────────────────────
alter table market_valuation_history enable row level security;
-- Supabase's default privileges grant new tables to the API roles; take them
-- back. Service role only: no client grant and no policy.
revoke all on market_valuation_history from public, anon, authenticated;
grant select, insert on market_valuation_history to service_role;

revoke all on function market_valuation_history_before_insert() from public, anon, authenticated;
revoke all on function market_valuation_history_append_only() from public, anon, authenticated;
revoke all on function market_valuation_history_no_truncate() from public, anon, authenticated;

-- Unchanged access model for the 049 objects, restated so a re-run cannot
-- widen it.
revoke all on market_listings from public, anon, authenticated;
grant all on market_listings to service_role;
revoke all on function market_listings_set_expiry() from public, anon, authenticated;
revoke all on function purge_market_listings(text, boolean) from public, anon, authenticated;
grant execute on function purge_market_listings(text, boolean) to service_role;

-- ── Rollback (run in this order) ─────────────────────────────────────────────
-- Dropping the history table discards every recorded valuation: export it
-- first if it holds anything. Restoring NOT NULL needs a value in every row,
-- so Soldgraph sources go back to 30 days and their listings get an expiry
-- of last_seen_at + 30 days; the next purge then applies 049's rules.
--
-- drop table if exists market_valuation_history;
-- drop function if exists market_valuation_history_no_truncate();
-- drop function if exists market_valuation_history_append_only();
-- drop function if exists market_valuation_history_before_insert();
-- alter table market_valuations drop column if exists source_summaries;
-- update market_sources set retention_days = 30, updated_at = now() where retention_days is null;
-- update market_listings set expires_at = last_seen_at + interval '30 days' where expires_at is null;
-- alter table market_listings alter column expires_at set not null;
-- alter table market_sources alter column retention_days set not null;
-- Then re-run the 049 definitions of market_listings_set_expiry() and
-- purge_market_listings() (section 2 of 049_market_evidence_and_provider_usage.sql).
-- notify pgrst, 'reload schema';
