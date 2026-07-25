-- ============================================================
-- Migration 007: Community posts, comments, conversations, messages
-- ============================================================

-- ─── community_posts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_posts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- References profiles(id) so PostgREST can embed profiles directly.
  -- profiles has a 1:1 with auth.users and the handle_new_user trigger ensures
  -- every auth.users row has a matching profiles row.
  author_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_type      TEXT        NOT NULL
                   CHECK (post_type IN ('in_search_of','for_trade','for_sale','new_pickup','discussion')),
  body           TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- Array of Supabase storage paths (community-photos bucket) or external URLs
  photos         JSONB       NOT NULL DEFAULT '[]',
  -- Optional link to a catalogue pin
  linked_pin_id  UUID        REFERENCES pins(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_posts_type_created_idx
  ON community_posts (post_type, created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_created_idx
  ON community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_author_idx
  ON community_posts (author_id);

CREATE TRIGGER community_posts_updated_at
  BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read posts
CREATE POLICY "community_posts_select_auth" ON community_posts
  FOR SELECT TO authenticated USING (true);

-- Users can only insert their own posts
CREATE POLICY "community_posts_insert_own" ON community_posts
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

-- Users can only update their own posts
CREATE POLICY "community_posts_update_own" ON community_posts
  FOR UPDATE TO authenticated USING (author_id = auth.uid());

-- Users can only delete their own posts
CREATE POLICY "community_posts_delete_own" ON community_posts
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ─── post_comments ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS post_comments_post_created_idx
  ON post_comments (post_id, created_at ASC);

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_comments_select_auth" ON post_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "post_comments_insert_own" ON post_comments
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY "post_comments_delete_own" ON post_comments
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ─── conversations ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_b_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Optional context for the opening message
  context_post_id   UUID        REFERENCES community_posts(id) ON DELETE SET NULL,
  context_pin_id    UUID        REFERENCES pins(id) ON DELETE SET NULL,
  last_message_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_different_participants
    CHECK (participant_a_id <> participant_b_id)
);

CREATE INDEX IF NOT EXISTS conversations_participant_a_idx
  ON conversations (participant_a_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS conversations_participant_b_idx
  ON conversations (participant_b_id, last_message_at DESC NULLS LAST);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Participants can read their own conversations
CREATE POLICY "conversations_select_participant" ON conversations
  FOR SELECT TO authenticated
  USING (participant_a_id = auth.uid() OR participant_b_id = auth.uid());

-- Either participant can create a conversation
CREATE POLICY "conversations_insert_participant" ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (participant_a_id = auth.uid() OR participant_b_id = auth.uid());

-- ─── conversation_messages ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body            TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conv_messages_conv_created_idx
  ON conversation_messages (conversation_id, created_at ASC);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Participants can read messages in their conversations
CREATE POLICY "conv_messages_select_participant" ON conversation_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND (c.participant_a_id = auth.uid() OR c.participant_b_id = auth.uid())
    )
  );

-- Participants can insert messages (sender must be themselves)
CREATE POLICY "conv_messages_insert_participant" ON conversation_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND (c.participant_a_id = auth.uid() OR c.participant_b_id = auth.uid())
    )
  );

-- ─── Update last_message_at on new message ────────────────────────────────────

CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conv_message_last_message_at
  AFTER INSERT ON conversation_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- NOTE: Requires a 'community-photos' Supabase Storage bucket for photo uploads.
-- Create it in the Supabase dashboard with authenticated-user write access.
