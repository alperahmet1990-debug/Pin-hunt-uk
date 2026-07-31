-- 027 — Trusted beta catalogue
--
-- Adds catalogue lifecycle flags to pins (trusted / active / archived +
-- searchability), trusted-source metadata columns, and a pin_sets table
-- describing validated sets. Tightens public read RLS so normal users only
-- see searchable pins — while still being able to see archived pins they
-- already own.

-- ── Pins: lifecycle + trusted metadata ───────────────────────────────────────
alter table pins
  add column if not exists catalogue_status text not null default 'active'
    check (catalogue_status in ('active', 'trusted', 'archived')),
  add column if not exists is_searchable boolean not null default true,
  add column if not exists programme text,
  add column if not exists collection_name text,
  add column if not exists release_wave text,
  add column if not exists release_scope text,
  add column if not exists collection_type text,
  add column if not exists normalised_series text,
  add column if not exists search_aliases text,
  add column if not exists main_subject text,
  add column if not exists subject_type text,
  add column if not exists validation_tier text,
  add column if not exists validation_notes text,
  add column if not exists validation_source_2 text,
  add column if not exists validated_date date,
  add column if not exists confidence_basis text,
  add column if not exists archived_at timestamptz;

create index if not exists pins_catalogue_status_idx on pins (catalogue_status);
create index if not exists pins_searchable_idx on pins (is_searchable) where is_searchable;
create index if not exists pins_normalised_series_idx on pins (normalised_series);

-- Owned-pin lookup used by the new RLS policy.
create index if not exists user_pins_pin_user_idx on user_pins (pin_id, user_id);

-- ── Public read: searchable pins only, plus pins the user already owns ──────
drop policy if exists pins_public_read on pins;
create policy pins_public_read on pins
  for select
  using (
    (verification_status = 'verified' and is_searchable = true)
    or exists (
      select 1 from user_pins up
      where up.pin_id = pins.id and up.user_id = auth.uid()
    )
  );
-- pins_admin_read_all (is_admin()) remains unchanged.

-- ── Sets / collections ───────────────────────────────────────────────────────
create table if not exists pin_sets (
  id uuid primary key default gen_random_uuid(),
  normalised_series text not null unique,
  set_name text not null,
  collection_name text,
  programme text,
  release_year integer,
  scope text,
  collection_type text,
  expected_pin_count integer,
  released_pin_count integer not null default 0,
  is_complete boolean not null default false,
  source_url text,
  secondary_source_url text,
  validation_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pin_sets enable row level security;

drop policy if exists pin_sets_public_read on pin_sets;
create policy pin_sets_public_read on pin_sets for select using (true);

drop policy if exists pin_sets_admin_write on pin_sets;
create policy pin_sets_admin_write on pin_sets for all using (is_admin());
