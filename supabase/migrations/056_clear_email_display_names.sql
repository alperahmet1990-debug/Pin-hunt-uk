-- ============================================================
-- Migration 056: display names never hold an email address (#429)
--
-- DRAFT, L3. Never applied by an agent. Run supabase/verify/056_precheck.sql
-- first (read-only). Then, staging first: apply in the Supabase SQL editor,
-- run supabase/verify/056_verify.sql there, and only then (separately
-- approved) on production.
--
-- Run AFTER 003. Safe to run more than once. Rollback at the bottom.
-- No column, grant or policy changes, so no PostgREST schema reload is needed.
--
--   1. handle_new_user(): a new profile takes a display name only from the
--      sign-up metadata. A blank value, or one containing '@', is stored as
--      NULL, matching safeDisplayName() in lib/pin-repository. There is no
--      fallback to any part of the email address. The '@' check also covers
--      app builds released before #429, which send the email as the name.
--   2. Existing profiles: display_name becomes NULL where it is the account's
--      own email or contains an email-shaped value. The app then shows the
--      username. updated_at moves on those rows (profiles_updated_at trigger).
--      A name that merely contains '@' ("Pins @ Paris") is left alone.
-- ============================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text := nullif(btrim(new.raw_user_meta_data->>'display_name'), '');
begin
  if position('@' in v_display_name) > 0 then
    v_display_name := null;
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

update public.profiles p
   set display_name = null
 where p.display_name ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+'
    or exists (
      select 1 from auth.users u
       where u.id = p.id
         and lower(btrim(p.display_name)) = lower(u.email)
    );

commit;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Restores the 003 trigger function. It does NOT restore cleared display names,
-- and no copy of them is kept: holding one would defeat the purpose. If a
-- display name has to come back, take it from a Supabase backup, for that
-- account only, or the collector can re-enter it.
--
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   insert into public.profiles (id, display_name)
--   values (
--     new.id,
--     coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
--   )
--   on conflict (id) do nothing;
--   return new;
-- end;
-- $$;
