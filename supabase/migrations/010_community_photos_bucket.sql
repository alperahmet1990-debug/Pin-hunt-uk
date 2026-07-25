-- ============================================================
-- Migration 010: community-photos Supabase Storage bucket
-- ============================================================
-- Creates the storage bucket used by the community photo upload
-- feature and applies RLS policies so authenticated users can
-- upload their own photos while keeping reads public.
-- ============================================================

-- Create the bucket (no-op if it already exists via the dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-photos',
  'community-photos',
  true,                           -- public so images load without signed URLs
  5242880,                        -- 5 MB per file
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- Any authenticated user can upload to a path prefixed by their own user-id.
-- The path format used by the app is: <userId>/<timestamp>-<index>.<ext>
CREATE POLICY "community_photos_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'community-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Uploads are public — anyone (including anonymous) can read.
CREATE POLICY "community_photos_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'community-photos');

-- Owner can delete their own photos.
CREATE POLICY "community_photos_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'community-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
