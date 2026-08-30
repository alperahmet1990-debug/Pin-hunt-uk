-- Harden the messaging additions from migration 031.
-- Generic conversation UPDATE access is replaced with one narrowly scoped RPC,
-- and structured message payloads are validated against server-side collection
-- and storage data.

DROP POLICY IF EXISTS "conversations_update_participant" ON conversations;

CREATE OR REPLACE FUNCTION link_conversation_trade(
  p_conversation_id UUID,
  p_trade_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  conversation_row conversations%ROWTYPE;
  trade_row trades%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO conversation_row
  FROM conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND
     OR caller_id NOT IN (conversation_row.participant_a_id, conversation_row.participant_b_id) THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  SELECT * INTO trade_row
  FROM trades
  WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  IF NOT (
    (trade_row.initiator_id = conversation_row.participant_a_id
      AND trade_row.recipient_id = conversation_row.participant_b_id)
    OR
    (trade_row.initiator_id = conversation_row.participant_b_id
      AND trade_row.recipient_id = conversation_row.participant_a_id)
  ) THEN
    RAISE EXCEPTION 'Trade participants do not match this conversation';
  END IF;

  UPDATE conversations
  SET trade_id = p_trade_id
  WHERE id = p_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION link_conversation_trade(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_conversation_trade(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION validate_conversation_message_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  photo_url TEXT;
  object_name TEXT;
BEGIN
  IF jsonb_typeof(NEW.pin_ids) <> 'array'
     OR jsonb_typeof(NEW.for_trade_pin_ids) <> 'array'
     OR jsonb_typeof(NEW.photo_urls) <> 'array' THEN
    RAISE EXCEPTION 'Message attachments must be arrays';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.pin_ids) item
    WHERE jsonb_typeof(item) <> 'string'
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.for_trade_pin_ids) item
    WHERE jsonb_typeof(item) <> 'string'
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.photo_urls) item
    WHERE jsonb_typeof(item) <> 'string'
  ) THEN
    RAISE EXCEPTION 'Message attachments must contain strings';
  END IF;

  CASE NEW.message_type
    WHEN 'text' THEN
      IF jsonb_array_length(NEW.pin_ids) <> 0
         OR jsonb_array_length(NEW.for_trade_pin_ids) <> 0
         OR jsonb_array_length(NEW.photo_urls) <> 0 THEN
        RAISE EXCEPTION 'Text messages cannot contain attachments';
      END IF;
    WHEN 'pin_share' THEN
      IF jsonb_array_length(NEW.pin_ids) NOT BETWEEN 1 AND 12
         OR jsonb_array_length(NEW.photo_urls) <> 0 THEN
        RAISE EXCEPTION 'Pin shares must contain between 1 and 12 pins';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(NEW.pin_ids) shared(pinhunt_id)
        LEFT JOIN pins p ON p.pinhunt_id = shared.pinhunt_id
        LEFT JOIN user_pins up
          ON up.user_id = NEW.sender_id
         AND up.pin_id = p.id
         AND up.status IN ('owned', 'for_trade')
        WHERE up.id IS NULL
      ) THEN
        RAISE EXCEPTION 'Only owned pins can be shared';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(NEW.for_trade_pin_ids) shared(pinhunt_id)
        LEFT JOIN pins p ON p.pinhunt_id = shared.pinhunt_id
        LEFT JOIN user_pins up
          ON up.user_id = NEW.sender_id
         AND up.pin_id = p.id
         AND up.status = 'for_trade'
        WHERE up.id IS NULL
      ) THEN
        RAISE EXCEPTION 'For Trade badges must match the sender collection';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(NEW.for_trade_pin_ids) marked(pinhunt_id)
        WHERE NOT NEW.pin_ids ? marked.pinhunt_id
      ) THEN
        RAISE EXCEPTION 'For Trade pins must be included in the share';
      END IF;
    WHEN 'photo' THEN
      IF jsonb_array_length(NEW.photo_urls) NOT BETWEEN 1 AND 6
         OR jsonb_array_length(NEW.pin_ids) <> 0
         OR jsonb_array_length(NEW.for_trade_pin_ids) <> 0 THEN
        RAISE EXCEPTION 'Photo messages must contain between 1 and 6 photos';
      END IF;

      FOR photo_url IN
        SELECT value FROM jsonb_array_elements_text(NEW.photo_urls)
      LOOP
        object_name := split_part(
          photo_url,
          '/storage/v1/object/public/community-photos/',
          2
        );
        IF object_name = photo_url
           OR object_name NOT LIKE NEW.sender_id::TEXT || '/%'
           OR NOT EXISTS (
             SELECT 1
             FROM storage.objects
             WHERE bucket_id = 'community-photos'
               AND name = object_name
           ) THEN
          RAISE EXCEPTION 'Photo must come from the sender storage folder';
        END IF;
      END LOOP;
    ELSE
      RAISE EXCEPTION 'Unsupported message type';
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_conversation_message_payload_trigger
  ON conversation_messages;
CREATE TRIGGER validate_conversation_message_payload_trigger
  BEFORE INSERT OR UPDATE ON conversation_messages
  FOR EACH ROW EXECUTE FUNCTION validate_conversation_message_payload();

-- Keep the existing last-message timestamp trigger functional without granting
-- clients general UPDATE rights on conversations.
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_posts_photos_max_six_check'
  ) THEN
    ALTER TABLE community_posts
      ADD CONSTRAINT community_posts_photos_max_six_check
      CHECK (
        jsonb_typeof(photos) = 'array'
        AND jsonb_array_length(photos) <= 6
      ) NOT VALID;
  END IF;
END $$;