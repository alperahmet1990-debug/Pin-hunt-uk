-- ============================================================
-- PinHunt UK — Migration 011: pin-catalogue storage bucket & policies
--
-- Ensures the pin-catalogue Supabase Storage bucket exists with
-- correct settings and applies RLS policies so:
--   • Anyone can read (public bucket, no auth required).
--   • Only admin users (is_admin()) can upload, replace, or delete.
--
-- This migration is idempotent — safe to run even if the bucket
-- was already created manually or via the Storage REST API.
--
-- Apply via the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Run AFTER migrations 001–010.
-- ============================================================

-- ─── Bucket ───────────────────────────────────────────────────────────────────
-- Creates the bucket if it doesn't exist; updates settings if it does.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pin-catalogue',
  'pin-catalogue',
  true,                                          -- public: GET requires no auth
  10485760,                                      -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Storage RLS policies ─────────────────────────────────────────────────────
-- Supabase Storage uses RLS on storage.objects. Each policy is dropped
-- and recreated so the migration is safe to re-run.

-- Public read: any client (even unauthenticated) can download pin images.
DROP POLICY IF EXISTS "pin_catalogue_storage_select_public" ON storage.objects;
CREATE POLICY "pin_catalogue_storage_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'pin-catalogue');

-- Admin upload: only is_admin() users may upload new images.
DROP POLICY IF EXISTS "pin_catalogue_storage_insert_admin" ON storage.objects;
CREATE POLICY "pin_catalogue_storage_insert_admin"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'pin-catalogue'
    AND is_admin()
  );

-- Admin replace: only is_admin() users may overwrite existing images.
DROP POLICY IF EXISTS "pin_catalogue_storage_update_admin" ON storage.objects;
CREATE POLICY "pin_catalogue_storage_update_admin"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'pin-catalogue'
    AND is_admin()
  );

-- Admin delete: only is_admin() users may remove images.
DROP POLICY IF EXISTS "pin_catalogue_storage_delete_admin" ON storage.objects;
CREATE POLICY "pin_catalogue_storage_delete_admin"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'pin-catalogue'
    AND is_admin()
  );
