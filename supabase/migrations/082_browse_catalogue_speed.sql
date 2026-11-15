-- ============================================================
-- Migration 082: make Browse Catalogue ("Add from catalogue") fast for
-- signed-in collectors
--
-- Never applied by an agent. Apply in the STAGING Supabase SQL editor first,
-- then production (separate step, swap the guard per
-- artifacts/api-server/scripts/PINANDPOP.md).
--
-- Symptom: opening Add from catalogue shows "0 pins" and
-- "canceling statement due to statement timeout".
--
-- Why: the screen (getCatalogueBrowsePage) reads `pins` directly, ordered by
-- collection, title, pinhunt_id, and counts the matches. With ~116k pins and
-- RLS, every row runs both SELECT policies:
--   pins_admin_read_all   is_admin()  -- SECURITY DEFINER, so never inlined:
--                                       one profiles look-up PER ROW
--   pins_public_read      exists (... user_pins ... = auth.uid())
--                                       -- auth.uid() re-evaluated per row
-- and with no index on the sort order Postgres reads and sorts every row
-- before returning the first 240, so a single page or count query can pass
-- the authenticated statement timeout on its own. Opening the screen runs
-- several of them at once (a page, the rest of its last set, and the counts),
-- which competes for the same CPU and slows each one. The earlier timings were
-- taken without a collector login, so they never paid the RLS cost.
--
-- What:
--   1. pins_browse_order_idx on (collection, title, pinhunt_id): a page is
--      read in index order and stops after 240 rows, so RLS runs on a few
--      hundred rows instead of 116k. Also serves the "one set" queries.
--   2. The two pins SELECT policies rewritten with (select is_admin()) and
--      (select auth.uid()). This is Supabase's documented RLS speed-up: the
--      value is worked out ONCE per query (an initPlan) instead of per row.
--      WHO CAN SEE WHAT IS UNCHANGED: same conditions, same roles, same
--      policy names. Counts still read every row but each row is cheap.
--
-- Safe to re-run (if not exists / drop + create in one transaction).
-- Run AFTER 027 (current pins_public_read definition).
-- ============================================================

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'pinhunt-staging-marker') then
    raise exception 'Not the staging project (no pinhunt-staging-marker bucket). Nothing was changed.';
  end if;
end $$;

begin;

-- 1. Index in the browse order.
create index if not exists pins_browse_order_idx on public.pins (collection, title, pinhunt_id);

-- 2. Same policies, evaluated once per query instead of once per row.
drop policy if exists pins_public_read on public.pins;
create policy pins_public_read on public.pins
  for select
  using (
    (verification_status = 'verified' and is_searchable = true)
    or exists (
      select 1 from public.user_pins up
      where up.pin_id = pins.id and up.user_id = (select auth.uid())
    )
  );

drop policy if exists pins_admin_read_all on public.pins;
create policy pins_admin_read_all on public.pins
  for select
  using ((select public.is_admin()));

commit;

analyze public.pins;

-- ── Verification ──────────────────────────────────────────────────────────────
--   Before AND after applying, compare:
--   select policyname, roles, qual from pg_policies
--    where tablename = 'pins' and cmd = 'SELECT';
--     -- pins_public_read and pins_admin_read_all, roles {public} both times
--     -- (002 and 027 have no TO clause), qual now with "( SELECT ..."
--   select indexname from pg_indexes where indexname = 'pins_browse_order_idx';  -- 1 row
--
--   Then, signed in as a NON-admin collector in the app: open Collection →
--   Add from catalogue. Pins show within ~1 s, no timeout message.
--   A collector still cannot see unverified pins they don't own; an admin
--   still sees every pin (same checks as before 082).
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
--   begin;
--   drop policy if exists pins_public_read on public.pins;
--   create policy pins_public_read on public.pins for select using (
--     (verification_status = 'verified' and is_searchable = true)
--     or exists (select 1 from user_pins up where up.pin_id = pins.id and up.user_id = auth.uid()));
--   drop policy if exists pins_admin_read_all on public.pins;
--   create policy pins_admin_read_all on public.pins for select using (is_admin());
--   commit;
--   drop index if exists public.pins_browse_order_idx;
-- ============================================================
-- End of migration 082.
-- ============================================================
