-- ============================================================
-- Migration 012: Admin moderation policies for community content
-- ============================================================
-- Adds DELETE policies so admins (profiles.is_admin = true) can
-- remove any community post or comment from the live feed.
--
-- Existing user-scoped policies (community_posts_delete_own,
-- post_comments_delete_own) are unchanged — users can still
-- delete their own content.

-- ─── community_posts: admin delete ───────────────────────────────────────────

CREATE POLICY "community_posts_delete_admin" ON community_posts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- ─── post_comments: admin delete ─────────────────────────────────────────────

CREATE POLICY "post_comments_delete_admin" ON post_comments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
