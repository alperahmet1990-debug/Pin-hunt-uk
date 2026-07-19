-- ============================================================
-- Migration 006: Trade Ratings + For-Trade visibility
-- ============================================================
-- 1. trade_ratings — positive/negative ratings between traders
-- 2. user_pins for_trade public read policy

-- ─── trade_ratings ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_ratings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id    UUID        REFERENCES trades(id) ON DELETE SET NULL,
  rater_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_positive BOOLEAN     NOT NULL,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trade_ratings_different_users CHECK (rater_id <> ratee_id),
  -- One rating per trade per rater (NULL trade_id allows standalone ratings)
  UNIQUE NULLS NOT DISTINCT (trade_id, rater_id)
);

CREATE INDEX IF NOT EXISTS trade_ratings_ratee_idx ON trade_ratings (ratee_id);
CREATE INDEX IF NOT EXISTS trade_ratings_rater_idx ON trade_ratings (rater_id);

ALTER TABLE trade_ratings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read ratings (displayed on public profiles)
CREATE POLICY "ratings_select_auth" ON trade_ratings
  FOR SELECT TO authenticated USING (true);

-- Users can only insert ratings where they are the rater
CREATE POLICY "ratings_insert_own" ON trade_ratings
  FOR INSERT TO authenticated
  WITH CHECK (rater_id = auth.uid() AND ratee_id <> auth.uid());

-- ─── user_pins: allow reading for_trade pins from other users ─────────────────
-- Needed so the "who has this for trade?" query can see others' pins.
-- The existing user_pins_select_own policy handles own pins; this adds
-- public visibility for for_trade status only.

CREATE POLICY "user_pins_for_trade_read"
  ON user_pins FOR SELECT TO authenticated
  USING (status = 'for_trade');

-- ─── trade_messages: participants can read & insert ───────────────────────────

ALTER TABLE trade_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trade_messages_select_participant" ON trade_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_messages.trade_id
        AND (t.initiator_id = auth.uid() OR t.recipient_id = auth.uid())
    )
  );

CREATE POLICY "trade_messages_insert_participant" ON trade_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_messages.trade_id
        AND (t.initiator_id = auth.uid() OR t.recipient_id = auth.uid())
    )
  );
