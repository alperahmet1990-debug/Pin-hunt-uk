-- ============================================================
-- PinHunt UK — Row Level Security Policies
-- Migration 002: RLS enable + policies
--
-- Run AFTER 001_schema.sql.
-- ============================================================

-- ─── Helper: prevent privilege escalation ────────────────────────────────────
-- Called in UPDATE policies to ensure users cannot promote themselves to admin.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ─── Enable RLS ───────────────────────────────────────────────────────────────

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins               ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_characters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_external_ids   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pin_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_submissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_messages     ENABLE ROW LEVEL SECURITY;

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Public profiles are readable by all authenticated users (needed for trades).
-- Only the owner can write their own profile.
-- is_admin cannot be self-promoted: the WITH CHECK enforces that is_admin
-- remains whatever value is already stored (only a service-role migration can
-- grant admin status).

CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevents escalating is_admin — new value must equal the stored value.
    AND is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- ─── pins ─────────────────────────────────────────────────────────────────────
-- Public users see only verified pins.
-- Writes are service-role only (import pipeline, admin tooling).

CREATE POLICY "pins_public_read" ON pins
  FOR SELECT USING (verification_status = 'verified');

-- Admins can read all pins regardless of verification status.
CREATE POLICY "pins_admin_read_all" ON pins
  FOR SELECT USING (is_admin());

-- ─── Reference / lookup tables ────────────────────────────────────────────────
-- characters, categories, pin_characters, pin_categories, pin_external_ids,
-- pin_images, pin_sources — public read only; writes are service-role only.

CREATE POLICY "characters_public_read"      ON characters       FOR SELECT USING (true);
CREATE POLICY "categories_public_read"      ON categories       FOR SELECT USING (true);
CREATE POLICY "pin_characters_public_read"  ON pin_characters   FOR SELECT USING (true);
CREATE POLICY "pin_categories_public_read"  ON pin_categories   FOR SELECT USING (true);
CREATE POLICY "pin_external_ids_public_read" ON pin_external_ids FOR SELECT USING (true);
CREATE POLICY "pin_images_public_read"      ON pin_images       FOR SELECT USING (true);
CREATE POLICY "pin_sources_public_read"     ON pin_sources      FOR SELECT USING (true);
CREATE POLICY "price_history_public_read"   ON price_history    FOR SELECT USING (true);

-- ─── user_pins ────────────────────────────────────────────────────────────────
-- Users manage only their own collection entries.

CREATE POLICY "user_pins_select_own" ON user_pins
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_pins_insert_own" ON user_pins
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_pins_update_own" ON user_pins
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_pins_delete_own" ON user_pins
  FOR DELETE USING (user_id = auth.uid());

-- ─── user_pin_images ──────────────────────────────────────────────────────────

CREATE POLICY "user_pin_images_select_own" ON user_pin_images
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_pin_images_insert_own" ON user_pin_images
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_pin_images_delete_own" ON user_pin_images
  FOR DELETE USING (user_id = auth.uid());

-- ─── pin_submissions ──────────────────────────────────────────────────────────
-- Any authenticated user can submit.
-- Users can read their own submissions.
-- Admins can read and update all submissions.

CREATE POLICY "pin_submissions_insert_auth" ON pin_submissions
  FOR INSERT WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "pin_submissions_select_own" ON pin_submissions
  FOR SELECT USING (submitted_by = auth.uid());

CREATE POLICY "pin_submissions_select_admin" ON pin_submissions
  FOR SELECT USING (is_admin());

CREATE POLICY "pin_submissions_update_admin" ON pin_submissions
  FOR UPDATE USING (is_admin());

-- ─── scan_attempts ────────────────────────────────────────────────────────────

CREATE POLICY "scan_attempts_select_own" ON scan_attempts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "scan_attempts_insert_own" ON scan_attempts
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─── trades ───────────────────────────────────────────────────────────────────
-- Only trade participants (initiator or recipient) can see or interact with a trade.

CREATE POLICY "trades_select_participant" ON trades
  FOR SELECT USING (
    auth.uid() = initiator_id OR auth.uid() = recipient_id
  );

CREATE POLICY "trades_insert_auth" ON trades
  FOR INSERT WITH CHECK (initiator_id = auth.uid());

CREATE POLICY "trades_update_participant" ON trades
  FOR UPDATE
  USING (auth.uid() = initiator_id OR auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = initiator_id OR auth.uid() = recipient_id);

-- ─── trade_items ──────────────────────────────────────────────────────────────

CREATE POLICY "trade_items_select_participant" ON trade_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_items.trade_id
        AND (t.initiator_id = auth.uid() OR t.recipient_id = auth.uid())
    )
  );

CREATE POLICY "trade_items_insert_participant" ON trade_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_items.trade_id
        AND t.initiator_id = auth.uid()
        AND t.status = 'pending'
    )
  );

CREATE POLICY "trade_items_delete_initiator" ON trade_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_items.trade_id
        AND t.initiator_id = auth.uid()
        AND t.status = 'pending'
    )
  );

-- ─── trade_messages ───────────────────────────────────────────────────────────

CREATE POLICY "trade_messages_select_participant" ON trade_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_messages.trade_id
        AND (t.initiator_id = auth.uid() OR t.recipient_id = auth.uid())
    )
  );

CREATE POLICY "trade_messages_insert_participant" ON trade_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_messages.trade_id
        AND (t.initiator_id = auth.uid() OR t.recipient_id = auth.uid())
        AND t.status IN ('pending', 'accepted')
    )
  );

-- ============================================================
-- Storage bucket RLS
-- ============================================================
-- Supabase Storage RLS is configured via the dashboard
-- (Authentication → Policies → Storage).
-- Create the following four buckets, then apply these policies:
--
-- BUCKET: avatars (public)
--   SELECT  → true (public read)
--   INSERT  → auth.uid()::text = (storage.foldername(name))[1]
--   UPDATE  → auth.uid()::text = (storage.foldername(name))[1]
--   DELETE  → auth.uid()::text = (storage.foldername(name))[1]
--
-- BUCKET: catalogue-images (public)
--   SELECT  → true (public read)
--   INSERT  → false (service role only via import pipeline)
--   UPDATE  → false
--   DELETE  → false
--
-- BUCKET: user-pin-images (private)
--   SELECT  → auth.uid()::text = (storage.foldername(name))[1]
--   INSERT  → auth.uid()::text = (storage.foldername(name))[1]
--   UPDATE  → auth.uid()::text = (storage.foldername(name))[1]
--   DELETE  → auth.uid()::text = (storage.foldername(name))[1]
--
-- BUCKET: scan-images (private)
--   SELECT  → auth.uid()::text = (storage.foldername(name))[1]
--   INSERT  → auth.uid()::text = (storage.foldername(name))[1]
--   DELETE  → auth.uid()::text = (storage.foldername(name))[1]
-- ============================================================
