-- ============================================================
-- PinHunt UK — Migration 005: Pin Submission Workflow v2
--
-- Drops the original JSONB-based pin_submissions table and
-- creates a new one with explicit columns for the contribution
-- workflow. Also creates the private pin-submissions storage
-- bucket and its RLS policies.
--
-- Run AFTER 001, 002, 003, 004.
-- ============================================================

-- ─── Drop old table (was schema-only, never populated) ───────────────────────
DROP TABLE IF EXISTS public.pin_submissions CASCADE;

-- ─── New pin_submissions table ────────────────────────────────────────────────
CREATE TABLE public.pin_submissions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by      UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposed_name     TEXT          NOT NULL,
  brand             TEXT          NOT NULL,
  series_name       TEXT,
  release_location  TEXT,
  release_year      INTEGER       CHECK (release_year >= 1900 AND release_year <= 2030),
  edition_type      TEXT          NOT NULL DEFAULT 'unknown'
                                    CHECK (edition_type IN (
                                      'open_edition','limited_edition','limited_release',
                                      'mystery','hidden_disney','unknown'
                                    )),
  edition_size      INTEGER       CHECK (edition_size > 0),
  fac_number        TEXT,
  sku               TEXT,
  character_names   TEXT[],
  front_image_path  TEXT          NOT NULL,
  back_image_path   TEXT,
  notes             TEXT,
  status            TEXT          NOT NULL DEFAULT 'draft'
                                    CHECK (status IN (
                                      'draft','submitted','under_review',
                                      'approved','rejected','needs_changes'
                                    )),
  reviewer_notes    TEXT,
  approved_pin_id   UUID          REFERENCES public.pins(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ps_submitted_by_idx        ON public.pin_submissions (submitted_by);
CREATE INDEX IF NOT EXISTS ps_status_idx              ON public.pin_submissions (status);
CREATE INDEX IF NOT EXISTS ps_submitted_by_status_idx ON public.pin_submissions (submitted_by, status);

CREATE TRIGGER pin_submissions_updated_at
  BEFORE UPDATE ON public.pin_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.pin_submissions ENABLE ROW LEVEL SECURITY;

-- Users insert only their own submissions
CREATE POLICY "ps_insert_own" ON public.pin_submissions
  FOR INSERT WITH CHECK (submitted_by = auth.uid());

-- Users read their own submissions (all statuses)
CREATE POLICY "ps_select_own" ON public.pin_submissions
  FOR SELECT USING (submitted_by = auth.uid());

-- Users update only their own draft/needs-changes rows.
-- They may move status to 'submitted' (submitting for review) but
-- cannot self-approve, self-reject, or set under_review.
CREATE POLICY "ps_update_own_draft" ON public.pin_submissions
  FOR UPDATE
  USING  (submitted_by = auth.uid() AND status IN ('draft', 'needs_changes'))
  WITH CHECK (
    submitted_by = auth.uid()
    AND status IN ('draft', 'submitted', 'needs_changes')
  );

-- Users delete only their own draft submissions
CREATE POLICY "ps_delete_own_draft" ON public.pin_submissions
  FOR DELETE USING (submitted_by = auth.uid() AND status = 'draft');

-- Admins read all submissions
CREATE POLICY "ps_select_admin" ON public.pin_submissions
  FOR SELECT USING (is_admin());

-- Admins update (approve / reject / set under_review / add reviewer_notes)
CREATE POLICY "ps_update_admin" ON public.pin_submissions
  FOR UPDATE USING (is_admin());

-- ─── Storage bucket: pin-submissions ─────────────────────────────────────────
-- Private bucket — submission images are not publicly accessible.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pin-submissions',
  'pin-submissions',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — file paths are: {user_id}/{submission_id}/front.jpg (or back.jpg)
CREATE POLICY "ps_storage_upload_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pin-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "ps_storage_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'pin-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "ps_storage_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'pin-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "ps_storage_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pin-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
