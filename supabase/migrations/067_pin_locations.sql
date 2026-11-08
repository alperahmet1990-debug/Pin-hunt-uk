-- ============================================================
-- Migration 067: where each pin lives (iPad: Collecting at home)
--
-- DRAFT. Never applied by an agent. Staging first: apply in the Supabase SQL
-- editor, run supabase/verify/067_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate approval. Rollback at the bottom.
-- Purely additive: two new tables and one trigger. No existing table, column,
-- policy or function changes, so the current app keeps working before and
-- after it is applied.
--
-- What it stores
--   collection_places   a collector's real-world places: "Trade book 2"
--                       (with pages and pockets per page), "Display frame,
--                       hallway", "Paris lanyard".
--   user_pin_locations  which place a pin in their collection lives in, and
--                       optionally the page and pocket: "Trade book 2, page 5,
--                       pocket 2". One location per collection entry.
--
-- Privacy: owner only
--   Where someone keeps their pins can describe their home, so neither table
--   is readable by anyone but its owner. That is why the location is NOT a
--   column on user_pins: the "user_pins_for_trade_read" policy (migration 006)
--   lets every signed-in user read whole For Trade rows of other collectors.
--   Signed-out clients get no access at all.
--
-- Integrity
--   - A location belongs to a collection entry: foreign key to
--     user_pins (user_id, pin_id) with ON DELETE CASCADE, so removing a pin
--     from the collection removes its location, and deleting the account
--     (auth.users cascade, migration 051) removes everything.
--   - A pin can only be placed in the same collector's place: composite
--     foreign key (place_id, user_id) to collection_places (id, user_id).
--   - Deleting a place unplaces its pins (their location rows go with it).
--   - Moving a pin to ISO ('wanted') clears its location: an ISO pin is one
--     you are looking for, so it is not in any of your books.
-- ============================================================

begin;

-- ─── collection_places ──────────────────────────────────────────────────────
create table if not exists public.collection_places (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null default auth.uid()
                                references auth.users(id) on delete cascade,
  name              text        not null
                                check (char_length(btrim(name)) between 1 and 60),
  kind              text        not null default 'other'
                                check (kind in ('book', 'board', 'display', 'lanyard', 'box', 'other')),
  -- Binders and trade books: how many pages, and pockets on each page.
  pages             smallint    check (pages between 1 and 500),
  pockets_per_page  smallint    check (pockets_per_page between 1 and 100),
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Target of user_pin_locations' composite foreign key.
  unique (id, user_id)
);

create index if not exists collection_places_user_idx
  on public.collection_places (user_id, sort_order);

drop trigger if exists collection_places_updated_at on public.collection_places;
create trigger collection_places_updated_at
  before update on public.collection_places
  for each row execute function public.set_updated_at();

-- ─── user_pin_locations ─────────────────────────────────────────────────────
create table if not exists public.user_pin_locations (
  user_id     uuid        not null default auth.uid(),
  pin_id      uuid        not null,
  place_id    uuid        not null,
  page        smallint    check (page >= 1),
  pocket      smallint    check (pocket >= 1),
  -- Free text for anything else ("top row", "behind the Figment").
  note        text        check (char_length(note) <= 120),
  updated_at  timestamptz not null default now(),
  primary key (user_id, pin_id),
  foreign key (user_id, pin_id)
    references public.user_pins (user_id, pin_id) on delete cascade,
  foreign key (place_id, user_id)
    references public.collection_places (id, user_id) on delete cascade,
  -- A pocket only means something on a page.
  check (pocket is null or page is not null)
);

create index if not exists user_pin_locations_place_idx
  on public.user_pin_locations (place_id, page, pocket);

drop trigger if exists user_pin_locations_updated_at on public.user_pin_locations;
create trigger user_pin_locations_updated_at
  before update on public.user_pin_locations
  for each row execute function public.set_updated_at();

-- ─── Row level security: owner only ─────────────────────────────────────────
alter table public.collection_places enable row level security;
alter table public.user_pin_locations enable row level security;

revoke all on public.collection_places from anon;
revoke all on public.user_pin_locations from anon;

drop policy if exists "collection_places_own" on public.collection_places;
create policy "collection_places_own" on public.collection_places
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_pin_locations_own" on public.user_pin_locations;
create policy "user_pin_locations_own" on public.user_pin_locations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Moving a pin to ISO clears its location ────────────────────────────────
create or replace function public.clear_location_when_wanted()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status = 'wanted' and old.status is distinct from 'wanted' then
    delete from public.user_pin_locations
     where user_id = new.user_id and pin_id = new.pin_id;
  end if;
  return new;
end;
$function$;

revoke all on function public.clear_location_when_wanted() from public;

drop trigger if exists user_pins_clear_location_when_wanted on public.user_pins;
create trigger user_pins_clear_location_when_wanted
  after update of status on public.user_pins
  for each row execute function public.clear_location_when_wanted();

commit;

-- ============================================================
-- ROLLBACK (removes every saved place and location)
-- begin;
-- drop trigger if exists user_pins_clear_location_when_wanted on public.user_pins;
-- drop function if exists public.clear_location_when_wanted();
-- drop table if exists public.user_pin_locations;
-- drop table if exists public.collection_places;
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
