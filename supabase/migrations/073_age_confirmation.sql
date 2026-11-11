-- ============================================================
-- Migration 073: confirm collectors are 18 or over (LP-8, #530)
--
-- DRAFT, L3. Never applied by an agent. Staging first: set the target in the
-- guard below, apply in the Supabase SQL editor, run
-- supabase/verify/073_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate approval, applied only when the matching app
-- update is ready (older builds have no Confirm age screen).
-- See supabase/verify/073_RUNBOOK.md. Rollback at the bottom.
-- Needs profiles (003), is_admin() (002), is_app_creator() (040) and the
-- column lists from 063. Does not depend on 064-071.
--
-- The number may need bumping depending on merge order: 070 is #581's,
-- 071 is #582's and 072 is the reported-message review (#584).
--
-- What it adds:
--   • profiles.age_confirmed_at, profiles.age_declined_at (timestamptz).
--     Not granted to anon or authenticated (063 made new columns private),
--     so no client can read or write them directly, including the owner.
--   • confirm_my_age(birth_date)  the signed-in collector states their date
--     of birth; the function works out the age from the server's date and
--     sets one of the two columns. The birth date is never stored or logged.
--     Once declined, every later call is refused.
--   • confirm_my_age_from_signup()  same, for an account whose sign-up
--     metadata says the Register screen already checked the age (so email
--     confirmation on another device still works). No date is involved.
--   • get_my_age_status()  'confirmed', 'declined' or 'unconfirmed', for the
--     signed-in collector only.
--   • admin_set_age_declined(user, declined)  admins only (LP-9, #531):
--     closes an account as under 18, or undoes that. Same limits as
--     suspensions (050): not yourself, an admin only by the App Creator, and
--     never the App Creator.
--
-- Existing accounts have neither column set, so the app asks them once, at
-- their next sign-in.
-- ============================================================

-- ── 0. Project guard ─────────────────────────────────────────────────────────
-- Edit `target` to the project you mean to change: 'staging' or 'production'.
-- The guard compares it with pinhunt_environment(), a one-line marker the
-- maintainer creates once per project (see 073_RUNBOOK.md), and stops on any
-- mismatch, a missing marker or missing prerequisites. Nothing below runs.
do $$
declare
  target text := 'staging';  -- <- 'staging' or 'production'
  actual text;
begin
  if to_regprocedure('public.pinhunt_environment()') is null then
    raise exception 'Project guard: pinhunt_environment() is missing. Create the marker first (073_RUNBOOK.md).';
  end if;
  execute 'select public.pinhunt_environment()' into actual;
  if actual is distinct from target then
    raise exception 'Project guard: this is %, not %. Nothing was changed.', actual, target;
  end if;
  if to_regclass('public.user_suspensions') is null
     or to_regprocedure('public.is_app_creator()') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'home_market') then
    raise exception 'Project guard: migrations 040, 050 and 068 must be applied first.';
  end if;
end $$;

begin;

-- ── 1. Columns ───────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists age_confirmed_at timestamptz,
  add column if not exists age_declined_at  timestamptz;

-- Belt and braces: 063 already keeps new columns private.
revoke select (age_confirmed_at, age_declined_at),
       insert (age_confirmed_at, age_declined_at),
       update (age_confirmed_at, age_declined_at)
  on public.profiles from anon, authenticated;


-- ── 2. The threshold, in one place ───────────────────────────────────────────
-- The app has the same constant (MINIMUM_AGE in lib/pin-repository).

create or replace function public.pinhunt_minimum_age()
returns integer language sql immutable
set search_path = public, pg_temp as $$ select 18 $$;


-- ── 3. Signed-in collector: status and confirmation ──────────────────────────

create or replace function public.get_my_age_status()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select case
    when p.age_declined_at is not null then 'declined'
    when p.age_confirmed_at is not null then 'confirmed'
    else 'unconfirmed'
  end
  from profiles p
  where p.id = auth.uid();
$$;

-- "Today" is the latest calendar date anywhere (UTC+14), so a collector whose
-- 18th birthday has begun where they live is never declined because the
-- server's clock is still on yesterday.
create or replace function public.confirm_my_age(p_birth_date date)
returns text language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'Etc/GMT-14')::date;
  v_row   profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_row from profiles where id = v_uid for update;
  if not found then
    raise exception 'no profile' using errcode = 'P0002';
  end if;
  if v_row.age_declined_at is not null then
    raise exception 'age declined' using errcode = '42501';
  end if;
  if v_row.age_confirmed_at is not null then
    return 'confirmed';
  end if;

  -- Never echo the date back in an error.
  if p_birth_date is null or p_birth_date > v_today or p_birth_date < date '1900-01-01' then
    raise exception 'invalid birth date' using errcode = '22023';
  end if;

  if date_part('year', age(v_today, p_birth_date)) >= pinhunt_minimum_age() then
    update profiles set age_confirmed_at = now() where id = v_uid;
    return 'confirmed';
  end if;

  update profiles set age_declined_at = now() where id = v_uid;
  return 'declined';
end;
$$;

-- Register already checked the date on the device and sent nothing; it only
-- set age_confirmed = true in the sign-up metadata.
create or replace function public.confirm_my_age_from_signup()
returns text language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_row     profiles%rowtype;
  v_flagged boolean;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_row from profiles where id = v_uid for update;
  if not found then
    raise exception 'no profile' using errcode = 'P0002';
  end if;
  if v_row.age_declined_at is not null then
    raise exception 'age declined' using errcode = '42501';
  end if;
  if v_row.age_confirmed_at is not null then
    return 'confirmed';
  end if;

  -- Only a JSON true counts (not "true", "yes" or 1).
  select coalesce(u.raw_user_meta_data -> 'age_confirmed' = 'true'::jsonb, false)
    into v_flagged
    from auth.users u where u.id = v_uid;
  if not coalesce(v_flagged, false) then
    return 'unconfirmed';
  end if;

  update profiles set age_confirmed_at = now() where id = v_uid;
  return 'confirmed';
end;
$$;


-- ── 4. Admins: close as under 18, or undo (LP-9, #531) ───────────────────────
-- Only touches age_declined_at. The account's suspension goes through
-- user_suspensions (050) as before; the app does both.

create or replace function public.admin_set_age_declined(p_user_id uuid, p_declined boolean)
returns void language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_target profiles%rowtype;
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_user_id is null or p_declined is null then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'not on your own account' using errcode = '42501';
  end if;

  select * into v_target from profiles where id = p_user_id for update;
  if not found then
    raise exception 'no profile' using errcode = 'P0002';
  end if;
  if v_target.is_app_creator or (v_target.is_admin and not is_app_creator()) then
    raise exception 'not allowed for this account' using errcode = '42501';
  end if;

  update profiles
     set age_declined_at = case when p_declined then coalesce(age_declined_at, now()) else null end
   where id = p_user_id;
end;
$$;


-- ── 5. Who may call what ─────────────────────────────────────────────────────

revoke all on function public.pinhunt_minimum_age()                  from public;
revoke all on function public.get_my_age_status()                    from public, anon;
revoke all on function public.confirm_my_age(date)                   from public, anon;
revoke all on function public.confirm_my_age_from_signup()           from public, anon;
revoke all on function public.admin_set_age_declined(uuid, boolean)  from public, anon;
grant execute on function public.pinhunt_minimum_age()                 to authenticated;
grant execute on function public.get_my_age_status()                   to authenticated;
grant execute on function public.confirm_my_age(date)                  to authenticated;
grant execute on function public.confirm_my_age_from_signup()          to authenticated;
grant execute on function public.admin_set_age_declined(uuid, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- Verification: supabase/verify/073_verify.sql (rolls itself back).
--
-- ROLLBACK. Ship or keep an app build that tolerates the functions being
-- missing first: the 073 app treats a missing get_my_age_status() as
-- "no check", so collectors are not locked out. Every recorded confirmation
-- and decline is lost; export them first if they are needed:
--   select id, age_confirmed_at, age_declined_at from profiles
--   where age_confirmed_at is not null or age_declined_at is not null;
--
-- begin;
-- drop function if exists public.admin_set_age_declined(uuid, boolean);
-- drop function if exists public.confirm_my_age_from_signup();
-- drop function if exists public.confirm_my_age(date);
-- drop function if exists public.get_my_age_status();
-- drop function if exists public.pinhunt_minimum_age();
-- alter table public.profiles drop column if exists age_declined_at;
-- alter table public.profiles drop column if exists age_confirmed_at;
-- commit;
-- notify pgrst, 'reload schema';
--
-- Note: 063's own rollback re-grants every profiles column except postcode
-- and the coordinates. If it is ever run after this migration, add
-- age_confirmed_at and age_declined_at to its exclusion list.
-- ============================================================
