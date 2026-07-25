-- ============================================================
-- Migration 015: Comment reports (community moderation flagging)
-- ============================================================
-- Collectors can report a post comment; admins see reported
-- comments surfaced in the Community Moderation queue.
-- Mirrors the post_reports pattern from migration 013.

CREATE TABLE IF NOT EXISTS comment_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID        NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  -- References profiles(id) (not auth.users) per project convention so
  -- PostgREST embedding works if reporter profiles are ever needed inline.
  reporter_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      TEXT        CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One report per collector per comment
  UNIQUE (comment_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS comment_reports_comment_idx ON comment_reports (comment_id);
CREATE INDEX IF NOT EXISTS comment_reports_created_idx ON comment_reports (created_at DESC);

ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

-- Collectors can file reports as themselves
CREATE POLICY "comment_reports_insert_own" ON comment_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Reporters can see their own reports (lets the app show "already reported")
CREATE POLICY "comment_reports_select_own" ON comment_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- Admins can see all reports
CREATE POLICY "comment_reports_select_admin" ON comment_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- Admins can dismiss (delete) reports
CREATE POLICY "comment_reports_delete_admin" ON comment_reports
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- Note: admin delete on post_comments already exists ("post_comments_delete_admin",
-- created in migration 012), so admins can remove reported comments.
