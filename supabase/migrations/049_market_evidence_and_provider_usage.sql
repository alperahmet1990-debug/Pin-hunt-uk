-- ============================================================
-- Migration 049: market evidence, per-market valuations, provider usage
-- and budget (SG-01, #404)
--
-- STAGING FIRST. Apply in the Supabase SQL editor on staging, run
-- supabase/verify/049_verify.sql there, and only then (separately approved)
-- on production, followed by:  notify pgrst, 'reload schema';
-- Never applied by an agent.
--
-- Purely additive: 5 new tables, 5 new functions, 1 trigger, seed rows in the
-- new market_sources table only. No existing table, column, policy or row is
-- changed or removed. In particular pin_market_estimates,
-- ebay_listing_snapshots (016), pins, user_pins and price_history are not
-- touched, and nothing here writes pins.estimated_value_gbp or
-- user_pins.current_value_gbp.
--
--   • market_sources     reference rows, one per source (provider × marketplace
--                        × market × sold/active), with a per-source retention
--                        setting (retention_days). Signed-in read.
--   • market_listings    deduplicated listing evidence, accepted and near-miss
--                        rejected, linked to the catalogue by pins.id only.
--                        No image or seller columns. Service role only.
--                        expires_at is capped by the source's retention_days;
--                        purge_market_listings() is the delete path.
--   • market_valuations  one derived Low/Fair/High row per (pin, market).
--                        Signed-in read; service role writes. `sources` may
--                        only hold source_id / count / latest_date.
--   • provider_usage     one row per billable provider call. Service role only.
--   • provider_budgets   monthly credit cap per provider. Service role only.
--   • reserve_provider_credit()  check the monthly budget and reserve credits
--                        in one locked step, so parallel searches cannot
--                        exceed the cap.
--   • record_provider_usage()    settle a reservation (or log an unreserved call).
--   • get_provider_month_usage() month totals without paging rows.
--
-- Reuses pins (001). Run AFTER 048. Rollback at the bottom.
-- ============================================================

-- ── 1. Sources ───────────────────────────────────────────────────────────────
create table if not exists market_sources (
  id              text        primary key check (id ~ '^[a-z0-9_]+:[a-z0-9_]+$' and length(id) <= 80),
  provider        text        not null check (provider ~ '^[a-z0-9_]{2,40}$'),
  marketplace     text        not null check (marketplace ~ '^[a-z0-9_]{2,40}$'),
  market          text        not null check (market in ('UK', 'US', 'FR')),
  currency        text        not null check (currency ~ '^[A-Z]{3}$'),
  evidence_type   text        not null check (evidence_type in ('sold', 'active')),
  enabled         boolean     not null default false,
  -- How long raw listing rows from this source may be kept (configurable, #403).
  retention_days  integer     not null default 30 check (retention_days between 1 and 365),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Seed. ON CONFLICT DO NOTHING: re-running never overrides a value the
-- maintainer has since changed (enabled, retention_days). All Soldgraph
-- sources start disabled; the provider is also behind SOLDGRAPH_ENABLED.
insert into market_sources (id, provider, marketplace, market, currency, evidence_type, enabled) values
  ('soldgraph:ebay_gb_sold',     'soldgraph',   'ebay',    'UK', 'GBP', 'sold',   false),
  ('soldgraph:ebay_fr_sold',     'soldgraph',   'ebay',    'FR', 'EUR', 'sold',   false),
  ('soldgraph:ebay_us_sold',     'soldgraph',   'ebay',    'US', 'USD', 'sold',   false),
  ('soldgraph:vinted_gb_active', 'soldgraph',   'vinted',  'UK', 'GBP', 'active', false),
  ('soldgraph:vinted_fr_active', 'soldgraph',   'vinted',  'FR', 'EUR', 'active', false),
  ('soldgraph:whatnot_us_active','soldgraph',   'whatnot', 'US', 'USD', 'active', false),
  ('ebay_browse:ebay_gb_active', 'ebay_browse', 'ebay',    'UK', 'GBP', 'active', false)
on conflict (id) do nothing;

-- ── 2. Listing evidence (raw third-party rows: service role only) ────────────
create table if not exists market_listings (
  id                   uuid          primary key default gen_random_uuid(),
  source_id            text          not null references market_sources(id) on delete restrict,
  external_id          text          not null check (length(external_id) between 1 and 200),
  pin_id               uuid          not null references pins(id) on delete cascade,
  title                text          not null check (length(title) <= 500),
  price                numeric(10,2) check (price >= 0),
  shipping             numeric(10,2) check (shipping >= 0),   -- NULL = unknown, never "free"
  currency             text          not null check (currency ~ '^[A-Z]{3}$'),
  sold_date            timestamptz,
  price_kind           text          not null check (price_kind in ('sold', 'sold_possible_offer', 'active')),
  -- Sold rows: true when the sale was a Best Offer (accepted price unknown);
  -- valuation excludes these. NULL = not reported.
  best_offer_accepted  boolean,
  listing_url          text          check (listing_url ~ '^https://' and length(listing_url) <= 2000),
  match_score          numeric(6,2),
  accepted             boolean       not null default false,
  -- A REJECTION_REASONS value from api-server services/market/matching.ts.
  rejection_reason     text          check (rejection_reason ~ '^[a-z_]{2,40}$'),
  -- Attributes parsed from the title (year, edition_size, variant_terms,
  -- series_guess, characters_guess). Small, flat, title-derived only.
  parsed               jsonb         check (parsed is null or (jsonb_typeof(parsed) = 'object' and length(parsed::text) <= 2000)),
  first_seen_at        timestamptz   not null default now(),
  last_seen_at         timestamptz   not null default now(),
  expires_at           timestamptz   not null,                -- set/capped by the trigger below
  unique (source_id, external_id, pin_id),
  constraint market_listing_accept_xor_reason check (not (accepted and rejection_reason is not null)),
  constraint market_listing_offer_on_sold_only check (price_kind <> 'active' or best_offer_accepted is not true),
  constraint market_listing_sold_has_date check (price_kind = 'active' or sold_date is not null)
);
create index if not exists market_listings_pin_idx on market_listings (pin_id, source_id);
create index if not exists market_listings_expires_idx on market_listings (expires_at);

-- expires_at never exceeds last_seen_at + the source's retention_days.
-- Seeing a listing again (last_seen_at moves) extends it, up to that cap.
create or replace function market_listings_set_expiry() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  cap timestamptz;
begin
  select new.last_seen_at + make_interval(days => s.retention_days) into cap
  from market_sources s where s.id = new.source_id;
  if cap is null then
    return new;  -- unknown source: the foreign key rejects the row
  end if;
  if tg_op = 'UPDATE' and new.last_seen_at is distinct from old.last_seen_at then
    new.expires_at := cap;
  else
    new.expires_at := least(coalesce(new.expires_at, cap), cap);
  end if;
  return new;
end $$;

drop trigger if exists market_listings_expiry on market_listings;
create trigger market_listings_expiry before insert or update on market_listings
  for each row execute function market_listings_set_expiry();

-- Delete path for raw listing rows.
--   purge_market_listings()                     expired rows, all sources
--   purge_market_listings('soldgraph:…')        expired rows, one source
--   purge_market_listings('soldgraph:…', true)  EVERY row of that source
--                                               (for example if the plan ends)
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
      and (p_source_id is null or l.source_id = p_source_id)
      and (l.expires_at <= now() or l.last_seen_at + make_interval(days => s.retention_days) <= now());
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 3. Valuations (derived values only: signed-in read) ──────────────────────
create table if not exists market_valuations (
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
  -- [{ "source_id": "...", "count": n, "latest_date": "..." }] and nothing else:
  -- this table is readable from the app, so no listing detail may enter it.
  sources           jsonb         not null default '[]'::jsonb
                      check (jsonb_typeof(sources) = 'array' and length(sources::text) <= 4000
                             and not jsonb_path_exists(sources, '$[*] ? (@.type() != "object")')
                             and not jsonb_path_exists(sources,
                               '$[*].keyvalue() ? (@.key != "source_id" && @.key != "count" && @.key != "latest_date")')),
  method_version    text          not null check (length(method_version) between 1 and 40),
  calculated_at     timestamptz   not null default now(),
  expires_at        timestamptz   not null,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  unique (pin_id, market),
  constraint market_valuation_ordered check (
    (low is null or fair is null or low <= fair) and
    (fair is null or high is null or fair <= high) and
    (low is null or high is null or low <= high))
);

-- ── 4. Provider usage and budgets (service role only) ────────────────────────
create table if not exists provider_usage (
  id               uuid          primary key default gen_random_uuid(),
  provider         text          not null check (provider ~ '^[a-z0-9_]{2,40}$'),
  route            text          not null check (length(route) between 1 and 200),
  request_id       text          check (length(request_id) <= 200),
  idempotency_key  text          not null check (length(idempotency_key) between 1 and 200),
  status           text          not null check (status in ('reserved', 'complete', 'failed', 'timeout', 'unavailable', 'error')),
  credits          integer       not null default 0 check (credits >= 0),
  cost_estimate    numeric(10,4) check (cost_estimate >= 0),
  -- pins.id when known. Deliberately no foreign key: a usage row must never be
  -- lost because a pin was deleted or an id was unexpected.
  pin_id           uuid,
  usage_month      text          not null check (usage_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  occurred_at      timestamptz   not null default now(),
  settled_at       timestamptz,
  created_at       timestamptz   not null default now(),
  unique (provider, idempotency_key)
);
create index if not exists provider_usage_month_idx on provider_usage (provider, usage_month);

create table if not exists provider_budgets (
  provider        text        not null check (provider ~ '^[a-z0-9_]{2,40}$'),
  month           text        not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  limit_credits   integer     not null check (limit_credits >= 0),
  hard_stop       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (provider, month)
);

-- Check the month's budget and reserve credits in one step. A transaction-level
-- advisory lock per (provider, month) serialises concurrent callers, so two
-- parallel searches cannot both take the last credit. Re-sending the same
-- idempotency key returns the existing reservation without charging again.
-- p_default_* apply when provider_budgets has no row for the month.
create or replace function reserve_provider_credit(
  p_provider           text,
  p_month              text,
  p_route              text,
  p_idempotency_key    text,
  p_credits            integer,
  p_pin_id             uuid,
  p_occurred_at        timestamptz,
  p_default_limit      integer,
  p_default_hard_stop  boolean)
returns table (allowed boolean, used_credits integer, limit_credits integer, hard_stop boolean)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_limit integer;
  v_hard  boolean;
  v_used  integer;
begin
  if p_credits is null or p_credits < 0 then
    raise exception 'reserve_provider_credit: invalid credits' using errcode = 'invalid_parameter_value';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider_usage:' || p_provider || ':' || p_month, 0));

  select b.limit_credits, b.hard_stop into v_limit, v_hard
  from provider_budgets b where b.provider = p_provider and b.month = p_month;
  if not found then
    v_limit := p_default_limit;
    v_hard  := coalesce(p_default_hard_stop, true);
  end if;
  if v_limit is null or v_limit < 0 then
    raise exception 'reserve_provider_credit: no budget' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(sum(u.credits), 0)::integer into v_used
  from provider_usage u where u.provider = p_provider and u.usage_month = p_month;

  if exists (select 1 from provider_usage u where u.provider = p_provider and u.idempotency_key = p_idempotency_key) then
    return query select true, v_used, v_limit, v_hard;
    return;
  end if;

  if v_hard and v_used + p_credits > v_limit then
    return query select false, v_used, v_limit, v_hard;
    return;
  end if;

  insert into provider_usage (provider, route, idempotency_key, status, credits, pin_id, usage_month, occurred_at)
  values (p_provider, p_route, p_idempotency_key, 'reserved', p_credits, p_pin_id, p_month,
          coalesce(p_occurred_at, now()));
  return query select true, v_used, v_limit, v_hard;
end $$;

-- Settle a reservation with the final status and credits (for example 0 for a
-- failed job), or log a call that was never reserved. A row that is already
-- settled is left as it is.
create or replace function record_provider_usage(
  p_provider         text,
  p_month            text,
  p_route            text,
  p_idempotency_key  text,
  p_status           text,
  p_credits          integer,
  p_request_id       text,
  p_pin_id           uuid,
  p_occurred_at      timestamptz)
returns void
language sql set search_path = public, pg_temp as $$
  insert into provider_usage (provider, route, request_id, idempotency_key, status, credits, pin_id,
                              usage_month, occurred_at, settled_at)
  values (p_provider, p_route, p_request_id, p_idempotency_key, p_status, p_credits, p_pin_id,
          p_month, coalesce(p_occurred_at, now()), now())
  on conflict (provider, idempotency_key) do update
    set status     = excluded.status,
        credits    = excluded.credits,
        request_id = coalesce(excluded.request_id, provider_usage.request_id),
        settled_at = now()
    where provider_usage.status = 'reserved';
$$;

create or replace function get_provider_month_usage(p_provider text, p_month text)
returns table (credits integer, requests integer)
language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(u.credits), 0)::integer, count(*)::integer
  from provider_usage u where u.provider = p_provider and u.usage_month = p_month;
$$;

-- ── 5. RLS and grants ────────────────────────────────────────────────────────
alter table market_sources    enable row level security;
alter table market_listings   enable row level security;
alter table market_valuations enable row level security;
alter table provider_usage    enable row level security;
alter table provider_budgets  enable row level security;

-- Supabase's default privileges grant new tables to the API roles; take them
-- back, then grant only what each table needs.
revoke all on market_sources, market_listings, market_valuations, provider_usage, provider_budgets
  from public, anon, authenticated;
grant all on market_sources, market_listings, market_valuations, provider_usage, provider_budgets
  to service_role;

-- Signed-in read: source reference rows and derived valuations only.
grant select on market_sources, market_valuations to authenticated;
drop policy if exists market_sources_read on market_sources;
create policy market_sources_read on market_sources for select to authenticated using (true);
drop policy if exists market_valuations_read on market_valuations;
create policy market_valuations_read on market_valuations for select to authenticated using (true);

-- market_listings, provider_usage, provider_budgets: no policies and no grants
-- for anon/authenticated. Only the API server (service role) reads or writes.
-- No insert/update/delete policies anywhere: writes are service role only.

revoke all on function market_listings_set_expiry() from public, anon, authenticated;
revoke all on function purge_market_listings(text, boolean) from public, anon, authenticated;
revoke all on function reserve_provider_credit(text, text, text, text, integer, uuid, timestamptz, integer, boolean)
  from public, anon, authenticated;
revoke all on function record_provider_usage(text, text, text, text, text, integer, text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function get_provider_month_usage(text, text) from public, anon, authenticated;
grant execute on function purge_market_listings(text, boolean) to service_role;
grant execute on function reserve_provider_credit(text, text, text, text, integer, uuid, timestamptz, integer, boolean)
  to service_role;
grant execute on function record_provider_usage(text, text, text, text, text, integer, text, uuid, timestamptz)
  to service_role;
grant execute on function get_provider_month_usage(text, text) to service_role;

-- ── Rollback (run in this order; drops only what this file created) ─────────
-- drop function if exists get_provider_month_usage(text, text);
-- drop function if exists record_provider_usage(text, text, text, text, text, integer, text, uuid, timestamptz);
-- drop function if exists reserve_provider_credit(text, text, text, text, integer, uuid, timestamptz, integer, boolean);
-- drop function if exists purge_market_listings(text, boolean);
-- drop trigger if exists market_listings_expiry on market_listings;
-- drop function if exists market_listings_set_expiry();
-- drop table if exists provider_budgets;
-- drop table if exists provider_usage;
-- drop table if exists market_valuations;
-- drop table if exists market_listings;
-- drop table if exists market_sources;
-- notify pgrst, 'reload schema';
