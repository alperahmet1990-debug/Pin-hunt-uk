-- ============================================================
-- PinHunt UK — Migration 009: Admin catalogue write policies
--
-- Grants authenticated admins INSERT / UPDATE on the pins
-- catalogue and its junction/lookup tables, so the admin pin
-- editor (createPin / updatePin via the Supabase anon key)
-- can persist changes without a service-role key.
--
-- Also adds an admin SELECT policy on pin-submissions storage
-- objects so admins can view submission images belonging to
-- other users.
--
-- Run AFTER 001–008.
-- ============================================================

-- ─── pins — admin write ───────────────────────────────────────────────────────
-- createPin upserts; updatePin uses UPDATE.

CREATE POLICY "pins_admin_insert"
  ON public.pins
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "pins_admin_update"
  ON public.pins
  FOR UPDATE
  USING    (is_admin())
  WITH CHECK (is_admin());

-- ─── characters — admin write ─────────────────────────────────────────────────
-- upsertCharacters calls: upsert + delete + insert

CREATE POLICY "characters_admin_insert"
  ON public.characters
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "characters_admin_update"
  ON public.characters
  FOR UPDATE
  USING    (is_admin())
  WITH CHECK (is_admin());

-- ─── categories — admin write ─────────────────────────────────────────────────

CREATE POLICY "categories_admin_insert"
  ON public.categories
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "categories_admin_update"
  ON public.categories
  FOR UPDATE
  USING    (is_admin())
  WITH CHECK (is_admin());

-- ─── pin_characters — admin write ─────────────────────────────────────────────

CREATE POLICY "pin_characters_admin_insert"
  ON public.pin_characters
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "pin_characters_admin_delete"
  ON public.pin_characters
  FOR DELETE
  USING (is_admin());

-- ─── pin_categories — admin write ─────────────────────────────────────────────

CREATE POLICY "pin_categories_admin_insert"
  ON public.pin_categories
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "pin_categories_admin_delete"
  ON public.pin_categories
  FOR DELETE
  USING (is_admin());

-- ─── Storage: pin-submissions — admin read ────────────────────────────────────
-- Allows admins to create signed URLs for any submission image,
-- regardless of which user uploaded it.

CREATE POLICY "ps_storage_select_admin"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'pin-submissions'
    AND is_admin()
  );

-- ─── Storage: pin-catalogue — new bucket for admin-uploaded pin images ─────────
-- Public bucket: admin writes, public reads.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pin-catalogue',
  'pin-catalogue',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pin_catalogue_storage_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'pin-catalogue');

CREATE POLICY "pin_catalogue_storage_insert_admin"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'pin-catalogue'
    AND is_admin()
  );

CREATE POLICY "pin_catalogue_storage_update_admin"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'pin-catalogue'
    AND is_admin()
  );

CREATE POLICY "pin_catalogue_storage_delete_admin"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'pin-catalogue'
    AND is_admin()
  );
