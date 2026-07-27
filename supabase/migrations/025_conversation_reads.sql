-- Migration 025: per-participant read tracking for conversations (unread badges)

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS a_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS b_last_read_at TIMESTAMPTZ;

-- Participants mark their own side as read. SECURITY DEFINER so we can update
-- only the caller's column without a broad UPDATE policy on conversations.
CREATE OR REPLACE FUNCTION mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE conversations
  SET a_last_read_at = CASE WHEN participant_a_id = v_uid THEN now() ELSE a_last_read_at END,
      b_last_read_at = CASE WHEN participant_b_id = v_uid THEN now() ELSE b_last_read_at END
  WHERE id = p_conversation_id
    AND (participant_a_id = v_uid OR participant_b_id = v_uid);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found or not a participant';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION mark_conversation_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_conversation_read(UUID) TO authenticated;
