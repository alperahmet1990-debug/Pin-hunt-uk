-- 014_realtime_community_feed.sql
-- Adds community_posts and post_comments to the supabase_realtime publication
-- so the community feed can receive new posts and live comment-count updates.
-- RLS still filters delivered events per subscriber's select policies.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'post_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE post_comments;
  END IF;
END $$;
