-- ============================================================
-- Migration 042: Pin & Pop reference images (admin review only)
--
-- Admins reviewing a contributed photo should be able to compare it with
-- the Pin & Pop image for the same pin, to check it really is the right
-- pin. Pin & Pop images can't be shown to collectors, so they're stored
-- as reference-only pin_images rows:
--
--   source                 = 'pin_and_pop'
--   source_record_id       = the Pin & Pop pin id
--   image_url              = the Pin & Pop-hosted image URL (not copied
--                            into our storage — storage_allowed = false)
--   public_display_allowed = false   (enforced below)
--   uploaded_by            = null    (enforced below — keeps these rows
--                            out of the contributed-photo queue/coverage)
--
-- pin_images_public_read (038) already hides rows with
-- public_display_allowed = false from everyone except admins, so these
-- rows are invisible to collectors at the RLS level too.
--
-- Purely additive. Run AFTER 041, in the Supabase SQL editor.
-- ============================================================

insert into catalogue_sources (
  id, display_name, attribution_text, rights_basis, exact_license_variant,
  public_display_allowed, storage_allowed, app_use_allowed, attribution_required, notes
) values (
  'pin_and_pop',
  'Pin & Pop',
  'Reference image: Pin & Pop',
  'Integration being explored — no public display rights',
  null,
  false, false, false, true,
  'Images are for admin reference during photo review only. Never shown to collectors.'
) on conflict (id) do nothing;

-- A Pin & Pop row can never become publicly displayable or look like a
-- collector contribution, whatever code writes it.
alter table pin_images drop constraint if exists pin_images_pin_and_pop_reference_only;
alter table pin_images add constraint pin_images_pin_and_pop_reference_only
  check (source is distinct from 'pin_and_pop' or (public_display_allowed = false and uploaded_by is null));

create index if not exists pin_images_pin_source_idx on pin_images (pin_id, source);


-- ── Adding a reference image (until a Pin & Pop import exists) ───────────────
--   insert into pin_images (pin_id, image_url, image_type, source, source_record_id,
--                           status, public_display_allowed)
--   select p.id, '<pin & pop image url>', 'reference', 'pin_and_pop',
--          p.external_identifiers->>'pin_and_pop', 'approved', false
--     from pins p where p.pinhunt_id = 'PHUK-XXXXXXXX';
--
-- ── Verification ──────────────────────────────────────────────────────────────
--   select id, public_display_allowed from catalogue_sources where id = 'pin_and_pop';
--   -- Must return 0:
--   select count(*) from pin_images where source = 'pin_and_pop' and public_display_allowed;
-- ============================================================
-- End of migration 042.
-- ============================================================
