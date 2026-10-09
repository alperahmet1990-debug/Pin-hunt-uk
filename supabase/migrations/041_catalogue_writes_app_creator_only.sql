-- ============================================================
-- Migration 041: Catalogue editing becomes App Creator only
--
-- After this, the roles split as:
--
--   App Creator — everything: catalogue editing (pins, characters,
--                 categories, sets, sources, catalogue images), imports,
--                 plus people/rollout management (040).
--   Admin       — moderation only: community posts/comments/reports,
--                 pin submissions (approve / reject / needs changes / merge
--                 into an existing pin), contributed photo review.
--                 Admins keep READ access to the full catalogue so they can
--                 review submissions and photos against it.
--
-- Every replaced policy keeps its original shape — only is_admin() becomes
-- is_app_creator() (040) on the WRITE side. Read policies are untouched or,
-- where an old FOR ALL policy also granted admin reads, an explicit admin
-- SELECT policy is added so admin visibility doesn't change.
--
-- Unaffected (stay admin): pin_submissions review (005), community
-- moderation (012/013/015), validation read policies (021), the
-- pins_admin_read_all / profiles_select_admin read policies.
--
-- Server-side writes (contributed photo approval, imports, validation) use
-- the service-role key and are gated in the API server instead — those
-- catalogue routes now require is_app_creator too.
--
-- Run AFTER 040, in the Supabase SQL editor — and make sure you've set
-- is_app_creator on your own profile (040 bootstrap) first, or nobody will
-- be able to edit the catalogue from the app.
-- ============================================================


-- ── pins (009, 013) ───────────────────────────────────────────────────────────

drop policy if exists "pins_admin_insert" on public.pins;
drop policy if exists "pins_app_creator_insert" on public.pins;
create policy "pins_app_creator_insert" on public.pins
  for insert with check (is_app_creator());

drop policy if exists "pins_admin_update" on public.pins;
drop policy if exists "pins_app_creator_update" on public.pins;
create policy "pins_app_creator_update" on public.pins
  for update using (is_app_creator()) with check (is_app_creator());

drop policy if exists "pins_admin_delete" on public.pins;
drop policy if exists "pins_app_creator_delete" on public.pins;
create policy "pins_app_creator_delete" on public.pins
  for delete using (is_app_creator());


-- ── characters / categories and their pin links (009) ────────────────────────

drop policy if exists "characters_admin_insert" on public.characters;
drop policy if exists "characters_app_creator_insert" on public.characters;
create policy "characters_app_creator_insert" on public.characters
  for insert with check (is_app_creator());

drop policy if exists "characters_admin_update" on public.characters;
drop policy if exists "characters_app_creator_update" on public.characters;
create policy "characters_app_creator_update" on public.characters
  for update using (is_app_creator()) with check (is_app_creator());

drop policy if exists "categories_admin_insert" on public.categories;
drop policy if exists "categories_app_creator_insert" on public.categories;
create policy "categories_app_creator_insert" on public.categories
  for insert with check (is_app_creator());

drop policy if exists "categories_admin_update" on public.categories;
drop policy if exists "categories_app_creator_update" on public.categories;
create policy "categories_app_creator_update" on public.categories
  for update using (is_app_creator()) with check (is_app_creator());

drop policy if exists "pin_characters_admin_insert" on public.pin_characters;
drop policy if exists "pin_characters_app_creator_insert" on public.pin_characters;
create policy "pin_characters_app_creator_insert" on public.pin_characters
  for insert with check (is_app_creator());

drop policy if exists "pin_characters_admin_delete" on public.pin_characters;
drop policy if exists "pin_characters_app_creator_delete" on public.pin_characters;
create policy "pin_characters_app_creator_delete" on public.pin_characters
  for delete using (is_app_creator());

drop policy if exists "pin_categories_admin_insert" on public.pin_categories;
drop policy if exists "pin_categories_app_creator_insert" on public.pin_categories;
create policy "pin_categories_app_creator_insert" on public.pin_categories
  for insert with check (is_app_creator());

drop policy if exists "pin_categories_admin_delete" on public.pin_categories;
drop policy if exists "pin_categories_app_creator_delete" on public.pin_categories;
create policy "pin_categories_app_creator_delete" on public.pin_categories
  for delete using (is_app_creator());


-- ── pin-catalogue storage bucket (009 / 011) ──────────────────────────────────
-- Public read is unchanged.

drop policy if exists "pin_catalogue_storage_insert_admin" on storage.objects;
drop policy if exists "pin_catalogue_storage_insert_app_creator" on storage.objects;
create policy "pin_catalogue_storage_insert_app_creator" on storage.objects
  for insert with check (bucket_id = 'pin-catalogue' and is_app_creator());

drop policy if exists "pin_catalogue_storage_update_admin" on storage.objects;
drop policy if exists "pin_catalogue_storage_update_app_creator" on storage.objects;
create policy "pin_catalogue_storage_update_app_creator" on storage.objects
  for update using (bucket_id = 'pin-catalogue' and is_app_creator());

drop policy if exists "pin_catalogue_storage_delete_admin" on storage.objects;
drop policy if exists "pin_catalogue_storage_delete_app_creator" on storage.objects;
create policy "pin_catalogue_storage_delete_app_creator" on storage.objects
  for delete using (bucket_id = 'pin-catalogue' and is_app_creator());


-- ── Import tables (011) ───────────────────────────────────────────────────────

drop policy if exists "import_batches_admin_all" on import_batches;
drop policy if exists "import_batches_app_creator_all" on import_batches;
create policy "import_batches_app_creator_all" on import_batches
  for all using (is_app_creator()) with check (is_app_creator());

drop policy if exists "pin_import_history_admin_all" on pin_import_field_history;
drop policy if exists "pin_import_history_app_creator_all" on pin_import_field_history;
create policy "pin_import_history_app_creator_all" on pin_import_field_history
  for all using (is_app_creator()) with check (is_app_creator());


-- ── Sets (027, 037) ───────────────────────────────────────────────────────────
-- The old FOR ALL policies also let admins read legacy sets/memberships —
-- kept via explicit admin SELECT policies.

drop policy if exists pin_sets_admin_write on pin_sets;
drop policy if exists pin_sets_app_creator_write on pin_sets;
create policy pin_sets_app_creator_write on pin_sets
  for all using (is_app_creator()) with check (is_app_creator());
drop policy if exists pin_sets_admin_read on pin_sets;
create policy pin_sets_admin_read on pin_sets
  for select using (is_admin());

drop policy if exists pin_set_memberships_admin_all on pin_set_memberships;
drop policy if exists pin_set_memberships_app_creator_all on pin_set_memberships;
create policy pin_set_memberships_app_creator_all on pin_set_memberships
  for all using (is_app_creator()) with check (is_app_creator());
drop policy if exists pin_set_memberships_admin_read on pin_set_memberships;
create policy pin_set_memberships_admin_read on pin_set_memberships
  for select using (is_admin());


-- ── Catalogue sources (037) ───────────────────────────────────────────────────

drop policy if exists catalogue_sources_admin_insert on catalogue_sources;
drop policy if exists catalogue_sources_app_creator_insert on catalogue_sources;
create policy catalogue_sources_app_creator_insert on catalogue_sources
  for insert with check (is_app_creator());

drop policy if exists catalogue_sources_admin_update on catalogue_sources;
drop policy if exists catalogue_sources_app_creator_update on catalogue_sources;
create policy catalogue_sources_app_creator_update on catalogue_sources
  for update using (is_app_creator()) with check (is_app_creator());


-- ── pin_images (038) ──────────────────────────────────────────────────────────
-- Admins still need to SEE every row (incl. pending) to review photos; the
-- approve/reject writes go through the API server with the service-role
-- key, so direct admin writes aren't needed.

drop policy if exists "pin_images_admin_all" on pin_images;
drop policy if exists "pin_images_admin_read" on pin_images;
create policy "pin_images_admin_read" on pin_images
  for select using (is_admin());
drop policy if exists "pin_images_app_creator_write" on pin_images;
create policy "pin_images_app_creator_write" on pin_images
  for all using (is_app_creator()) with check (is_app_creator());


-- ── Verification ──────────────────────────────────────────────────────────────
--   select tablename, policyname, cmd from pg_policies
--    where policyname like '%app_creator%' order by tablename, policyname;
--   -- Should list no remaining admin write policies on catalogue tables:
--   select tablename, policyname, cmd from pg_policies
--    where tablename in ('pins','characters','categories','pin_characters',
--      'pin_categories','pin_sets','pin_set_memberships','catalogue_sources',
--      'import_batches','pin_import_field_history','pin_images')
--      and qual like '%is_admin()%' and cmd <> 'SELECT';
-- ============================================================
-- End of migration 041.
-- ============================================================
