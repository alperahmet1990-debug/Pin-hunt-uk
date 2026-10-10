-- ============================================================
-- Migration 043: user_boards — sync collector boards to the cloud
-- ============================================================
-- Until now custom Boards lived only in AsyncStorage on the device
-- (BoardsContext, key '@pinhunt_boards_v2:<userId>'), so deleting the app,
-- changing phone, or signing in on the web lost them.
--
-- One row per board, mirroring the app's Board shape. Pins are stored as an
-- array of pinhunt_ids (PHUK-…, the same id the app uses as CataloguePin.id)
-- rather than a join table, because:
--   - the app reads and writes a whole board at a time, so a board is pushed
--     as a single upsert (one write for a 300-pin "select all", not 300);
--   - boards never grant ownership — the app only shows board pins the
--     collector still owns/has for trade (getBoardPins), so a dangling id is
--     harmless and no FK to pins is needed;
--   - pin order on a board is preserved for free.
--
-- id is the app-generated board id (e.g. 'board_1791638542147fv46x'), kept
-- as text so existing on-device boards upload with their ids unchanged and
-- /board/[id] links keep working. Unique per user, not globally.
--
-- Boards are private: only the owner can read or write them. Shareable
-- boards are a roadmap item and would need their own policy.
--
-- Purely additive: no existing table, column, or policy is changed.
-- Run AFTER 001–042, in the Supabase SQL editor.
-- ============================================================


-- ── 1. Table ──────────────────────────────────────────────────────────────────

create table if not exists user_boards (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  id               text        not null check (char_length(id) between 1 and 64),
  name             text        not null check (char_length(btrim(name)) between 1 and 80),
  pin_ids          text[]      not null default '{}' check (cardinality(pin_ids) <= 5000),
  thumbnail_pin_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, id)
);


-- ── 2. updated_at maintenance ─────────────────────────────────────────────────

create or replace function user_boards_touch_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_boards_touch_updated_at on user_boards;
create trigger user_boards_touch_updated_at
  before update on user_boards
  for each row execute function user_boards_touch_updated_at();


-- ── 3. RLS — owner only ───────────────────────────────────────────────────────

alter table user_boards enable row level security;

drop policy if exists user_boards_select_own on user_boards;
create policy user_boards_select_own
  on user_boards for select
  using (auth.uid() = user_id);

drop policy if exists user_boards_insert_own on user_boards;
create policy user_boards_insert_own
  on user_boards for insert
  with check (auth.uid() = user_id);

drop policy if exists user_boards_update_own on user_boards;
create policy user_boards_update_own
  on user_boards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_boards_delete_own on user_boards;
create policy user_boards_delete_own
  on user_boards for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on user_boards to authenticated;


-- ── Verification ──────────────────────────────────────────────────────────────
--   select policyname, cmd from pg_policies where tablename = 'user_boards';
--   -- As a signed-in user (app), after creating a board:
--   select id, name, cardinality(pin_ids) from user_boards;
-- ============================================================
-- End of migration 043.
-- ============================================================
