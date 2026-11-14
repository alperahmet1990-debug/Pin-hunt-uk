-- ============================================================
-- Migration 079: on-demand sold-price requests ("Get a price")
--
-- STAGING FIRST. Apply in the Supabase SQL editor on staging, run
-- supabase/verify/079_verify.sql there, and only then (separately approved)
-- on production, followed by:  notify pgrst, 'reload schema';
-- Never applied by an agent.
--
-- Needs 049, 054 and 055 applied first (market_sources, market_listings,
-- market_valuations, provider_usage, provider_budgets, valuation history).
--
-- Purely additive: 1 new table and 1 new function. No existing table,
-- column, policy or row is changed.
--
--   • market_price_requests   one row per accepted price request for one pin,
--                             from a signed-in collector ("user") or a future
--                             maintainer batch ("batch"). Holds counts only:
--                             no listing rows, prices, titles or links.
--                             Service role only.
--   • claim_market_price_request()   the single, locked decision point:
--                             reject a duplicate in-flight request, answer
--                             from a recent finished request (including one
--                             that found no sales), enforce the per-user and
--                             global daily caps, then record a pending row.
--
-- The monthly Soldgraph credit cap stays where it is (provider_budgets and
-- reserve_provider_credit(), 049). This table only decides whether a request
-- may start; every credit is still reserved against that cap.
--
-- Rollback at the bottom.
-- ============================================================

create table if not exists market_price_requests (
  id                  uuid primary key default gen_random_uuid(),
  pin_id              uuid not null references pins(id) on delete cascade,
  -- The collector who asked. Null for a batch request, and set null if the
  -- account is deleted (the request row itself holds nothing personal).
  requested_by        uuid references auth.users(id) on delete set null,
  origin              text not null check (origin in ('user', 'batch')),
  -- market_sources ids searched, e.g. {soldgraph:ebay_gb_sold,soldgraph:ebay_us_sold}.
  sources             text[] not null check (cardinality(sources) between 1 and 6),
  status              text not null default 'pending' check (status in ('pending', 'complete', 'failed')),
  -- complete → priced | no_sales; failed → stopped (budget/kill switch) | error.
  outcome             text check (outcome in ('priced', 'no_sales', 'stopped', 'error')),
  -- Sold sales behind each market's value after the request, e.g. {"UK": 4, "US": 0}.
  sold_counts         jsonb check (sold_counts is null or jsonb_typeof(sold_counts) = 'object'),
  worst_case_credits  integer not null check (worst_case_credits between 0 and 20),
  credits_spent       integer not null default 0 check (credits_spent between 0 and 20),
  created_at          timestamptz not null default now(),
  finished_at         timestamptz,
  constraint market_price_requests_outcome_matches_status check (
    (status = 'pending'  and outcome is null and finished_at is null) or
    (status = 'complete' and outcome in ('priced', 'no_sales') and finished_at is not null) or
    (status = 'failed'   and outcome in ('stopped', 'error') and finished_at is not null)
  )
);

-- At most one in-flight request per pin, enforced by the database as well as
-- by the claim function.
create unique index if not exists market_price_requests_one_pending
  on market_price_requests (pin_id) where status = 'pending';
create index if not exists market_price_requests_pin_recent
  on market_price_requests (pin_id, created_at desc);
create index if not exists market_price_requests_user_recent
  on market_price_requests (requested_by, created_at desc) where requested_by is not null;
create index if not exists market_price_requests_origin_recent
  on market_price_requests (origin, created_at desc);

-- One locked step. A transaction-level advisory lock serialises every claim,
-- so two taps (or two collectors) cannot both start a paid search for the
-- same pin, and nobody can slip past a daily cap. Requests are rare, so a
-- single lock is fine.
--
-- Returns one row; `decision` is one of:
--   claimed      a pending row was written; request_id is its id
--   in_flight    another request for this pin is still running
--   cached       a request for this pin finished within p_cache_days and
--                searched at least these sources; cached_outcome is
--                'priced' or 'no_sales' (empty results are cached too)
--   user_cap     this collector reached p_user_daily_limit in the last 24h
--   global_cap   all collectors together reached p_global_daily_limit
-- retry_after is when the same call could next be claimed (null if unknown).
create or replace function claim_market_price_request(
  p_pin_id                 uuid,
  p_user_id                uuid,
  p_origin                 text,
  p_sources                text[],
  p_worst_case_credits     integer,
  p_user_daily_limit       integer,
  p_global_daily_limit     integer,
  p_cache_days             integer,
  p_pending_timeout_mins   integer)
returns table (decision text, request_id uuid, cached_outcome text, cached_at timestamptz, retry_after timestamptz)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_row   market_price_requests%rowtype;
  v_count integer;
  v_first timestamptz;
  v_id    uuid;
begin
  if p_origin not in ('user', 'batch') then
    raise exception 'claim_market_price_request: invalid origin' using errcode = 'invalid_parameter_value';
  end if;
  if p_origin = 'user' and p_user_id is null then
    raise exception 'claim_market_price_request: user required' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(cardinality(p_sources), 0) = 0 or p_worst_case_credits is null or p_worst_case_credits < 0
     or p_user_daily_limit is null or p_user_daily_limit < 0
     or p_global_daily_limit is null or p_global_daily_limit < 0
     or p_cache_days is null or p_cache_days < 0
     or p_pending_timeout_mins is null or p_pending_timeout_mins < 1 then
    raise exception 'claim_market_price_request: invalid limits' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('market_price_requests', 0));

  -- A pending row older than the timeout belongs to a server that stopped
  -- part way (restart, crash). Close it so the pin is not blocked for ever.
  update market_price_requests
     set status = 'failed', outcome = 'error', finished_at = now()
   where pin_id = p_pin_id and status = 'pending'
     and created_at < now() - make_interval(mins => p_pending_timeout_mins);

  if exists (select 1 from market_price_requests where pin_id = p_pin_id and status = 'pending') then
    return query select 'in_flight'::text, null::uuid, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Cache: the latest finished request for this pin that searched at least
  -- the sources asked for now. "no_sales" is cached just like "priced".
  select * into v_row
    from market_price_requests
   where pin_id = p_pin_id and status = 'complete'
     and finished_at > now() - make_interval(days => p_cache_days)
     and sources @> p_sources
   order by finished_at desc
   limit 1;
  if found then
    return query select 'cached'::text, v_row.id, v_row.outcome, v_row.finished_at,
                        v_row.finished_at + make_interval(days => p_cache_days);
    return;
  end if;

  if p_origin = 'user' then
    select count(*), min(created_at) into v_count, v_first
      from market_price_requests
     where requested_by = p_user_id and created_at > now() - interval '24 hours';
    if v_count >= p_user_daily_limit then
      return query select 'user_cap'::text, null::uuid, null::text, null::timestamptz, v_first + interval '24 hours';
      return;
    end if;

    select count(*), min(created_at) into v_count, v_first
      from market_price_requests
     where origin = 'user' and created_at > now() - interval '24 hours';
    if v_count >= p_global_daily_limit then
      return query select 'global_cap'::text, null::uuid, null::text, null::timestamptz, v_first + interval '24 hours';
      return;
    end if;
  end if;

  insert into market_price_requests (pin_id, requested_by, origin, sources, worst_case_credits)
  values (p_pin_id, case when p_origin = 'user' then p_user_id else null end, p_origin, p_sources, p_worst_case_credits)
  returning id into v_id;
  return query select 'claimed'::text, v_id, null::text, null::timestamptz, null::timestamptz;
end $$;

-- ── RLS and grants ───────────────────────────────────────────────────────────
alter table market_price_requests enable row level security;

-- Supabase's default privileges grant new tables to the API roles; take them
-- back. Only the API server (service role) reads or writes this table: no
-- policies and no grants for anon/authenticated.
revoke all on market_price_requests from public, anon, authenticated;
grant all on market_price_requests to service_role;

revoke all on function claim_market_price_request(uuid, uuid, text, text[], integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function claim_market_price_request(uuid, uuid, text, text[], integer, integer, integer, integer, integer)
  to service_role;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Drops the request log only. Listings, valuations, history and provider
-- usage (049/055) are untouched.
--
-- drop function if exists claim_market_price_request(uuid, uuid, text, text[], integer, integer, integer, integer, integer);
-- drop table if exists market_price_requests;
-- notify pgrst, 'reload schema';
