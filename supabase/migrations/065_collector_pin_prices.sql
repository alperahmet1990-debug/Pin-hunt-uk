-- ============================================================
-- Migration 065: collector pin prices and community prices (CV-01, #512)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/065_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate approval. Rollback at the bottom.
-- Needs profiles, pins, user_pins (001) and user_suspensions (050).
--
-- Collectors set their own price for a pin they have in their collection or
-- For Trade. The community price is the median of those prices, per pin and
-- currency (#511, decisions of 8 Nov 2026):
--
--   1. collector_pin_prices      one price per collector, pin and currency
--                                (GBP or USD, never converted). No direct
--                                table access: every read and write goes
--                                through the functions below.
--   2. collector_price_settings  "Include my prices in community prices",
--                                on unless the collector turns it off.
--   3. Functions for the signed-in collector:
--        set_my_pin_price, clear_my_pin_price, get_my_pin_prices,
--        get_my_community_price_setting, set_my_community_price_setting.
--   4. get_community_prices(pinhunt_ids, currency) returns totals only:
--        collector_count, median, low, high, entries (the amounts, only when
--        1–2 collectors), step ('early' below the threshold, 'confident' at
--        or above it). Never a user id.
--
-- Who counts in a community price:
--   - the collector still has the pin owned or For Trade (user_pins);
--   - the price was set or confirmed in the last 12 months;
--   - the account is at least 7 days old;
--   - the account is not suspended (user_suspensions, 050);
--   - the collector has not opted out.
-- From 5 collectors, prices above 3x or below 1/3 of the median are left out.
--
-- Prices are deliberately NOT stored in user_pins: its user_pins_for_trade_read
-- policy (006) lets any signed-in user read For Trade rows.
--
-- The "confident" threshold lives in community_price_confident_min() so it
-- can be changed with one CREATE OR REPLACE and no app release.
-- ============================================================

begin;

-- ── 1. collector_pin_prices ──────────────────────────────────────────────────

create table if not exists collector_pin_prices (
  user_id     uuid          not null references profiles(id) on delete cascade,
  pin_id      uuid          not null references pins(id) on delete cascade,
  currency    text          not null check (currency in ('GBP', 'USD')),
  amount      numeric(10,2) not null check (amount > 0 and amount <= 100000),
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  primary key (user_id, pin_id, currency)
);

create index if not exists collector_pin_prices_pin_idx
  on collector_pin_prices (pin_id, currency);

alter table collector_pin_prices enable row level security;
-- No policies and no grants: clients use the functions only.
revoke all on collector_pin_prices from public, anon, authenticated;


-- ── 2. collector_price_settings ──────────────────────────────────────────────

create table if not exists collector_price_settings (
  user_id               uuid        primary key references profiles(id) on delete cascade,
  include_in_community  boolean     not null default true,
  updated_at            timestamptz not null default now()
);

alter table collector_price_settings enable row level security;
revoke all on collector_price_settings from public, anon, authenticated;


-- ── 3. Settings: the threshold ───────────────────────────────────────────────

create or replace function public.community_price_confident_min()
returns integer
language sql
immutable
as $$ select 3 $$;

revoke all on function public.community_price_confident_min() from public, anon;
grant execute on function public.community_price_confident_min() to authenticated;


-- ── 4. The signed-in collector's own prices ──────────────────────────────────

create or replace function public.set_my_pin_price(p_pinhunt_id text, p_currency text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_pin_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_currency is null or p_currency not in ('GBP', 'USD') then
    raise exception 'invalid currency %', p_currency;
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    raise exception 'invalid amount';
  end if;

  select id into v_pin_id from pins where pinhunt_id = p_pinhunt_id;
  if v_pin_id is null then
    raise exception 'unknown pin %', p_pinhunt_id;
  end if;

  if not exists (
    select 1 from user_pins
    where user_id = v_user and pin_id = v_pin_id and status in ('owned', 'for_trade')
  ) then
    raise exception 'pin not in your collection';
  end if;

  insert into collector_pin_prices (user_id, pin_id, currency, amount)
  values (v_user, v_pin_id, p_currency, round(p_amount, 2))
  on conflict (user_id, pin_id, currency)
  do update set amount = excluded.amount, updated_at = now();
end;
$$;

create or replace function public.clear_my_pin_price(p_pinhunt_id text, p_currency text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  delete from collector_pin_prices cpp
  using pins p
  where p.id = cpp.pin_id
    and p.pinhunt_id = p_pinhunt_id
    and cpp.user_id = v_user
    and cpp.currency = p_currency;
end;
$$;

-- The collector's own prices for the given pins (every currency).
create or replace function public.get_my_pin_prices(p_pinhunt_ids text[])
returns table (pinhunt_id text, currency text, amount numeric, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(array_length(p_pinhunt_ids, 1), 0) > 1000 then
    raise exception 'at most 1000 pins per call';
  end if;
  return query
    select p.pinhunt_id, cpp.currency, cpp.amount, cpp.updated_at
    from collector_pin_prices cpp
    join pins p on p.id = cpp.pin_id
    where cpp.user_id = auth.uid()
      and p.pinhunt_id = any(p_pinhunt_ids);
end;
$$;

create or replace function public.get_my_community_price_setting()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select include_in_community from collector_price_settings where user_id = auth.uid()),
    true
  );
$$;

create or replace function public.set_my_community_price_setting(p_include boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_include is null then
    raise exception 'p_include is required';
  end if;
  insert into collector_price_settings (user_id, include_in_community)
  values (auth.uid(), p_include)
  on conflict (user_id)
  do update set include_in_community = excluded.include_in_community, updated_at = now();
end;
$$;


-- ── 5. Community prices: totals only ─────────────────────────────────────────

create or replace function public.get_community_prices(p_pinhunt_ids text[], p_currency text)
returns table (
  pinhunt_id       text,
  collector_count  integer,
  median           numeric,
  low              numeric,
  high             numeric,
  entries          numeric[],
  step             text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_currency is null or p_currency not in ('GBP', 'USD') then
    raise exception 'invalid currency %', p_currency;
  end if;
  if coalesce(array_length(p_pinhunt_ids, 1), 0) > 1000 then
    raise exception 'at most 1000 pins per call';
  end if;

  return query
  with eligible as (
    select p.pinhunt_id as pid, cpp.amount
    from collector_pin_prices cpp
    join pins p       on p.id = cpp.pin_id
    join profiles pr  on pr.id = cpp.user_id
    join user_pins up on up.user_id = cpp.user_id
                     and up.pin_id = cpp.pin_id
                     and up.status in ('owned', 'for_trade')
    left join collector_price_settings s on s.user_id = cpp.user_id
    where p.pinhunt_id = any(p_pinhunt_ids)
      and cpp.currency = p_currency
      and cpp.updated_at > now() - interval '12 months'
      and pr.created_at <= now() - interval '7 days'
      and coalesce(s.include_in_community, true)
      and not exists (select 1 from user_suspensions us where us.user_id = cpp.user_id)
  ),
  first_pass as (
    select e.pid, count(*) as n,
           percentile_cont(0.5) within group (order by e.amount) as m
    from eligible e
    group by e.pid
  ),
  kept as (
    select e.pid, e.amount
    from eligible e
    join first_pass f on f.pid = e.pid
    where f.n < 5 or (e.amount <= f.m * 3 and e.amount >= f.m / 3)
  )
  select
    k.pid,
    count(*)::integer,
    round((percentile_cont(0.5) within group (order by k.amount))::numeric, 2),
    case when count(*) >= 5
      then round((percentile_cont(0.1) within group (order by k.amount))::numeric, 2)
      else min(k.amount) end,
    case when count(*) >= 5
      then round((percentile_cont(0.9) within group (order by k.amount))::numeric, 2)
      else max(k.amount) end,
    case when count(*) <= 2 then array_agg(k.amount order by k.amount) end,
    case when count(*) >= community_price_confident_min() then 'confident' else 'early' end
  from kept k
  group by k.pid;
end;
$$;


-- ── 6. Grants ────────────────────────────────────────────────────────────────

revoke all on function public.set_my_pin_price(text, text, numeric) from public, anon;
revoke all on function public.clear_my_pin_price(text, text) from public, anon;
revoke all on function public.get_my_pin_prices(text[]) from public, anon;
revoke all on function public.get_my_community_price_setting() from public, anon;
revoke all on function public.set_my_community_price_setting(boolean) from public, anon;
revoke all on function public.get_community_prices(text[], text) from public, anon;

grant execute on function public.set_my_pin_price(text, text, numeric) to authenticated;
grant execute on function public.clear_my_pin_price(text, text) to authenticated;
grant execute on function public.get_my_pin_prices(text[]) to authenticated;
grant execute on function public.get_my_community_price_setting() to authenticated;
grant execute on function public.set_my_community_price_setting(boolean) to authenticated;
grant execute on function public.get_community_prices(text[], text) to authenticated;

commit;

-- ============================================================
-- Verification: supabase/verify/065_verify.sql (rolls itself back).
-- Then: notify pgrst, 'reload schema';
--
-- ROLLBACK (removes every collector price; export first if any are worth keeping):
-- begin;
-- drop function if exists public.get_community_prices(text[], text);
-- drop function if exists public.set_my_community_price_setting(boolean);
-- drop function if exists public.get_my_community_price_setting();
-- drop function if exists public.get_my_pin_prices(text[]);
-- drop function if exists public.clear_my_pin_price(text, text);
-- drop function if exists public.set_my_pin_price(text, text, numeric);
-- drop function if exists public.community_price_confident_min();
-- drop table if exists collector_price_settings;
-- drop table if exists collector_pin_prices;
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
