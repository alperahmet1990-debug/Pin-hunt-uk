-- ============================================================
-- Migration 068: profiles.home_market (HM-01, #561)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/068_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate approval. Rollback at the bottom.
-- Needs profiles (003, 007) and the column lists from 063.
--
-- A collector's home market, 'UK' or 'US', sets their defaults: currency,
-- market prices, events first, nearby lookups and date style (#560). It
-- never hides anything. Existing profiles take it from `country` (007):
-- United States / US / USA -> 'US', everything else 'UK' (decision 2,
-- 8 Nov 2026). New profiles default to 'UK' until the collector chooses.
--
-- 063 gave signed-in clients fixed column lists, so a new column is private
-- until granted: this adds home_market to the select, insert and update
-- lists. The existing row policies still limit writes to your own profile.
-- ============================================================

begin;

alter table public.profiles
  add column if not exists home_market text not null default 'UK';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_home_market_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_home_market_check check (home_market in ('UK', 'US'));
  end if;
end $$;

update public.profiles
set home_market = 'US'
where home_market = 'UK'
  and lower(trim(coalesce(country, ''))) in ('us', 'usa', 'u.s.', 'u.s.a.', 'united states', 'united states of america');

grant select (home_market) on public.profiles to authenticated;
grant insert (home_market) on public.profiles to authenticated;
grant update (home_market) on public.profiles to authenticated;

commit;

-- ============================================================
-- Verification: supabase/verify/068_verify.sql (rolls itself back).
-- Then: notify pgrst, 'reload schema';
--
-- ROLLBACK (the app falls back to UK when the column is missing):
-- begin;
-- revoke select (home_market), insert (home_market), update (home_market) on public.profiles from authenticated;
-- alter table public.profiles drop constraint if exists profiles_home_market_check;
-- alter table public.profiles drop column if exists home_market;
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
