-- ============================================================
-- Migration 013: Post reports (community moderation flagging)
-- ============================================================
-- Collectors can report a community post; admins see reported
-- posts surfaced first in the moderation queue.

CREATE TABLE IF NOT EXISTS post_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  -- References profiles(id) (not auth.users) per project convention so
  -- PostgREST embedding works if reporter profiles are ever needed inline.
  reporter_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      TEXT        CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One report per collector per post
  UNIQUE (post_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS post_reports_post_idx ON post_reports (post_id);
CREATE INDEX IF NOT EXISTS post_reports_created_idx ON post_reports (created_at DESC);

ALTER TABLE post_reports ENABLE ROW LEVEL SECURITY;

-- Collectors can file reports as themselves
CREATE POLICY "post_reports_insert_own" ON post_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Reporters can see their own reports (lets the app show "already reported")
CREATE POLICY "post_reports_select_own" ON post_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- Admins can see all reports
CREATE POLICY "post_reports_select_admin" ON post_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- Admins can dismiss (delete) reports
CREATE POLICY "post_reports_delete_admin" ON post_reports
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
