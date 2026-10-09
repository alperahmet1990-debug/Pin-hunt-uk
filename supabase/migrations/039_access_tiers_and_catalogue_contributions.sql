-- ============================================================
-- Migration 039: Access tiers, feature flags, catalogue contributions
--
-- Adds a three-level audience model for gating features:
--
--   admin        → profiles.is_admin (existing, unchanged)
--   contributor  → profiles.is_contributor (new; admins count automatically)
--   public       → everyone signed in
--
-- Each gated feature has one row in feature_flags whose `audience` says
-- which level can see it. Rolling a feature out is a single row update —
-- no user changes, no app release.
--
-- First feature: 'catalogue_contributions' — the "Help build the catalogue"
-- browse screen over the Collectible PinTrader catalogue, showing which pins
-- have photos and letting people contribute/propose one. Starts at 'admin'.
--
-- Also:
--   - pin_images.proposal_reason — why a contributor proposed a photo for a
--     pin that may already have one (shown in the admin review queue).
--   - get_catalogue_image_coverage() — per-pin photo status for the screen.
--   - A trigger stopping users granting themselves is_admin / is_contributor
--     (see the note on section 2 — this also hardens is_admin).
--
-- Purely additive: no column, table, or policy is dropped.
-- Run AFTER 001–038, in the Supabase SQL editor.
-- ============================================================


-- ── 1. profiles.is_contributor ────────────────────────────────────────────────

alter table profiles
  add column if not exists is_contributor boolean not null default false;


-- ── 2. Privilege guard trigger ────────────────────────────────────────────────
-- 002_rls.sql's profiles_update_own policy blocks self-promotion to admin via
-- its WITH CHECK, but 003_profiles_v2.sql also created a permissive
-- "Users can update their own profile" policy with only `auth.uid() = id`.
-- Permissive policies are OR'd, so if that 003 policy is still present, the
-- 002 guard is bypassed. Rather than depend on which policies exist, enforce
-- it with a trigger that covers both privilege columns.
--
-- Allowed to change them: admins, and sessions with no auth.uid() (the SQL
-- editor and the service-role key, which is how the API server writes).

create or replace function guard_profile_privileges()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.is_contributor := false;
  else
    if new.is_admin is distinct from old.is_admin
       or new.is_contributor is distinct from old.is_contributor then
      raise exception 'Not allowed to change access level'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on profiles;
create trigger profiles_guard_privileges
  before insert or update on profiles
  for each row execute function guard_profile_privileges();


-- ── 3. is_contributor() helper ────────────────────────────────────────────────
-- Same SECURITY DEFINER shape as is_admin() (002_rls.sql). Admins count.

create or replace function is_contributor()
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(
    (select is_contributor or is_admin from profiles where id = auth.uid()),
    false
  );
$$;


-- ── 4. feature_flags ──────────────────────────────────────────────────────────

create table if not exists feature_flags (
  key         text primary key,
  audience    text not null default 'admin'
                check (audience in ('admin', 'contributor', 'public')),
  description text,
  updated_at  timestamptz not null default now()
);

alter table feature_flags enable row level security;

-- Flags aren't secret — the app reads them to decide what to show. The
-- server-side check is can_access_feature(), not this read.
drop policy if exists "feature_flags_read" on feature_flags;
create policy "feature_flags_read" on feature_flags
  for select using (true);

drop policy if exists "feature_flags_admin_write" on feature_flags;
create policy "feature_flags_admin_write" on feature_flags
  for all using (is_admin()) with check (is_admin());

insert into feature_flags (key, audience, description)
values (
  'catalogue_contributions',
  'admin',
  'Help build the catalogue: browse the Collectible PinTrader catalogue by photo status and contribute or propose pin photos.'
)
on conflict (key) do nothing;


-- ── 5. can_access_feature(key) ────────────────────────────────────────────────
-- Unknown keys return false (fail closed).

create or replace function can_access_feature(p_key text)
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(
    (select case audience
              when 'public'      then auth.uid() is not null
              when 'contributor' then is_contributor()
              when 'admin'       then is_admin()
              else false
            end
       from feature_flags where key = p_key),
    false
  );
$$;

grant execute on function can_access_feature(text) to authenticated;


-- ── 6. pin_images.proposal_reason ─────────────────────────────────────────────
-- 'missing'      — pin had no photo (the default flow)
-- 'wrong_pin'    — current photo shows a different pin
-- 'poor_quality' — current photo is blurry / tiny / cluttered
-- 'other'
-- Nullable: rows from 038's scan flow pre-date this and stay null.

alter table pin_images
  add column if not exists proposal_reason text
    check (proposal_reason in ('missing', 'wrong_pin', 'poor_quality', 'other'));


-- ── 7. get_catalogue_image_coverage() ─────────────────────────────────────────
-- One row per searchable Collectible PinTrader pin with its photo status.
-- Returns nothing unless the caller can access 'catalogue_contributions'.
--
-- SECURITY DEFINER because contributors need *counts* of other people's
-- pending photos (pin_images RLS hides those rows) — only the count and the
-- caller's own latest status are returned, never other users' rows.
--
-- image_source:
--   'community' — an approved contributed photo exists for the pin
--   'reference' — has image_url, but not from a contribution (CTP import)
--   null        — no photo
--
-- Callers should page with .range() — PostgREST caps rows per request.

create or replace function get_catalogue_image_coverage()
returns table (
  pinhunt_id     text,
  title          text,
  set_name       text,
  release_year   integer,
  edition_type   text,
  image_url      text,
  image_source   text,
  pending_count  integer,
  my_status      text
)
language sql stable security definer
set search_path = public as $$
  select
    p.pinhunt_id,
    p.title,
    coalesce(nullif(p.normalised_series, ''), p.collection) as set_name,
    p.release_year,
    p.edition_type,
    p.image_url,
    case
      when exists (
        select 1 from pin_images ai
        where ai.pin_id = p.id and ai.uploaded_by is not null and ai.status = 'approved'
      ) then 'community'
      when p.image_url is not null then 'reference'
      else null
    end as image_source,
    (select count(*)::int from pin_images pi
      where pi.pin_id = p.id and pi.uploaded_by is not null and pi.status = 'pending') as pending_count,
    (select mi.status from pin_images mi
      where mi.pin_id = p.id and mi.uploaded_by = auth.uid()
      order by mi.created_at desc limit 1) as my_status
  from pins p
  where can_access_feature('catalogue_contributions')
    and p.catalogue_source = 'collectible_pintrader'
    and p.verification_status = 'verified'
    and coalesce(p.is_searchable, true)
    and coalesce(p.catalogue_status, 'active') <> 'archived'
  order by set_name, p.title, p.pinhunt_id;
$$;

grant execute on function get_catalogue_image_coverage() to authenticated;

create index if not exists pin_images_pin_status_idx on pin_images (pin_id, status);
create index if not exists pin_images_uploaded_by_idx on pin_images (uploaded_by);


-- ── Day-to-day usage ──────────────────────────────────────────────────────────
--   Make someone a contributor:
--     update profiles set is_contributor = true where username = '...';
--   Roll the feature out:
--     update feature_flags set audience = 'contributor' where key = 'catalogue_contributions';
--
-- ── Verification ──────────────────────────────────────────────────────────────
--   select key, audience from feature_flags;
--   select count(*) from get_catalogue_image_coverage();   -- as an admin session
--   -- Check whether the permissive 003 update policy is still present:
--   select policyname, cmd, with_check from pg_policies
--    where tablename = 'profiles' and cmd = 'UPDATE';
-- ============================================================
-- End of migration 039.
-- ============================================================
