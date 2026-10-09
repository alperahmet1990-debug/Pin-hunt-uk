-- ============================================================
-- Migration 040: App Creator role — manages who has which access
--
-- Adds a level above admin:
--
--   app creator  → profiles.is_app_creator (new) — the only role that can
--                  grant/remove admin and contributor rights, and change
--                  feature_flags audiences (rollouts).
--   admin        → profiles.is_admin — moderation (approve photos, posts,
--                  submissions). Can no longer change anyone's access.
--   contributor  → profiles.is_contributor (039)
--   public
--
-- An app creator is always also an admin (check constraint), so every
-- existing is_admin() policy keeps working for them unchanged.
--
-- is_app_creator itself can only be set from the Supabase SQL editor
-- (or the service-role key) — never from the app, not even by another app
-- creator. See "Bootstrap" at the bottom.
--
-- People changes go through set_user_access() (SECURITY DEFINER, checks
-- is_app_creator()) and are recorded in access_changes.
--
-- Purely additive except: replaces guard_profile_privileges() (039) and the
-- feature_flags write policy (039) with stricter versions.
-- Run AFTER 039, in the Supabase SQL editor.
-- ============================================================


-- ── 1. profiles.is_app_creator ────────────────────────────────────────────────

alter table profiles
  add column if not exists is_app_creator boolean not null default false;

alter table profiles drop constraint if exists profiles_app_creator_is_admin;
alter table profiles
  add constraint profiles_app_creator_is_admin
  check (not is_app_creator or is_admin);


-- ── 2. is_app_creator() helper ────────────────────────────────────────────────

create or replace function is_app_creator()
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(
    (select is_app_creator from profiles where id = auth.uid()),
    false
  );
$$;


-- ── 3. Stricter privilege guard (replaces 039's) ──────────────────────────────
-- is_admin / is_contributor: only an app creator (or SQL editor/service role).
-- is_app_creator: only the SQL editor/service role (auth.uid() is null).

create or replace function guard_profile_privileges()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if auth.uid() is null then
    return new;  -- SQL editor / service role
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.is_contributor := false;
    new.is_app_creator := false;
    return new;
  end if;

  if new.is_app_creator is distinct from old.is_app_creator then
    raise exception 'App Creator can only be changed in the database console'
      using errcode = '42501';
  end if;

  if (new.is_admin is distinct from old.is_admin
      or new.is_contributor is distinct from old.is_contributor)
     and not is_app_creator() then
    raise exception 'Only the App Creator can change access levels'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
-- Trigger profiles_guard_privileges (039) already points at this function.


-- ── 4. Audit log ──────────────────────────────────────────────────────────────

create table if not exists access_changes (
  id                  uuid primary key default gen_random_uuid(),
  changed_by          uuid references auth.users(id) on delete set null,
  target_user         uuid not null references auth.users(id) on delete cascade,
  old_is_admin        boolean not null,
  new_is_admin        boolean not null,
  old_is_contributor  boolean not null,
  new_is_contributor  boolean not null,
  created_at          timestamptz not null default now()
);

alter table access_changes enable row level security;

drop policy if exists "access_changes_app_creator_read" on access_changes;
create policy "access_changes_app_creator_read" on access_changes
  for select using (is_app_creator());
-- No insert/update/delete policies: rows are written only by
-- set_user_access() below (SECURITY DEFINER).


-- ── 5. get_my_access() — the caller's own levels ──────────────────────────────
-- Lets the app show/hide creator-only UI without adding columns to the
-- profile select (which would break on databases missing this migration).

create or replace function get_my_access()
returns table (is_app_creator boolean, is_admin boolean, is_contributor boolean)
language sql stable security definer
set search_path = public as $$
  select p.is_app_creator, p.is_admin, p.is_contributor
  from profiles p where p.id = auth.uid();
$$;

grant execute on function get_my_access() to authenticated;


-- ── 6. list_user_access(query) — app creator only ─────────────────────────────
-- Searches all profiles (including private ones, which profiles RLS hides)
-- by username / display name. With an empty query, returns everyone who
-- currently has elevated access.

create or replace function list_user_access(p_query text default '')
returns table (
  id              uuid,
  username        text,
  display_name    text,
  avatar_url      text,
  is_app_creator  boolean,
  is_admin        boolean,
  is_contributor  boolean
)
language sql stable security definer
set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url,
         p.is_app_creator, p.is_admin, p.is_contributor
  from profiles p
  where is_app_creator()
    and (
      (coalesce(trim(p_query), '') = ''
        and (p.is_admin or p.is_contributor or p.is_app_creator))
      or (coalesce(trim(p_query), '') <> ''
        and (p.username ilike '%' || trim(p_query) || '%'
             or p.display_name ilike '%' || trim(p_query) || '%'))
    )
  order by p.is_app_creator desc, p.is_admin desc, p.is_contributor desc, p.username
  limit 50;
$$;

grant execute on function list_user_access(text) to authenticated;


-- ── 7. set_user_access(user, admin, contributor) — app creator only ───────────

create or replace function set_user_access(
  p_user uuid,
  p_is_admin boolean,
  p_is_contributor boolean
)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_old record;
begin
  if not is_app_creator() then
    raise exception 'Only the App Creator can change access levels'
      using errcode = '42501';
  end if;

  select is_admin, is_contributor, is_app_creator into v_old
  from profiles where id = p_user for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if v_old.is_app_creator and not p_is_admin then
    raise exception 'The App Creator is always an admin' using errcode = '42501';
  end if;

  if v_old.is_admin = p_is_admin and v_old.is_contributor = p_is_contributor then
    return;
  end if;

  update profiles
     set is_admin = p_is_admin, is_contributor = p_is_contributor
   where id = p_user;

  insert into access_changes (changed_by, target_user,
    old_is_admin, new_is_admin, old_is_contributor, new_is_contributor)
  values (auth.uid(), p_user,
    v_old.is_admin, p_is_admin, v_old.is_contributor, p_is_contributor);
end;
$$;

grant execute on function set_user_access(uuid, boolean, boolean) to authenticated;


-- ── 8. Feature rollouts: app creator only (replaces 039's admin policy) ───────

drop policy if exists "feature_flags_admin_write" on feature_flags;
drop policy if exists "feature_flags_app_creator_write" on feature_flags;
create policy "feature_flags_app_creator_write" on feature_flags
  for all using (is_app_creator()) with check (is_app_creator());


-- ── Bootstrap (run once, by hand, after this migration) ───────────────────────
--   update profiles set is_app_creator = true, is_admin = true
--    where username = '<your username>';
--
-- ── Verification ──────────────────────────────────────────────────────────────
--   select username, is_app_creator, is_admin, is_contributor
--     from profiles where is_admin or is_contributor or is_app_creator;
-- ============================================================
-- End of migration 040.
-- ============================================================
