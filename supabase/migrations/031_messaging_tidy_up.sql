-- Messaging tidy-up: structured shares and an optional agreed trade link.
-- This is deliberately additive: existing rows, triggers, and RLS remain intact.

ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS pin_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS for_trade_pin_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_messages_message_type_check'
  ) THEN
    ALTER TABLE conversation_messages
      ADD CONSTRAINT conversation_messages_message_type_check
      CHECK (message_type IN ('text', 'pin_share', 'photo'));
  END IF;
END $$;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS trade_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_trade_id_fkey'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_trade_id_fkey
      FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Linking a trade is a conversation participant action. This leaves all existing
-- policies in place and only adds the missing UPDATE permission needed by it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversations'
      AND policyname = 'conversations_update_participant'
  ) THEN
    CREATE POLICY "conversations_update_participant" ON conversations
      FOR UPDATE TO authenticated
      USING (participant_a_id = auth.uid() OR participant_b_id = auth.uid())
      WITH CHECK (
        (participant_a_id = auth.uid() OR participant_b_id = auth.uid())
        AND (
          trade_id IS NULL
          OR EXISTS (
            SELECT 1 FROM trades
            WHERE trades.id = conversations.trade_id
              AND (trades.initiator_id = auth.uid() OR trades.recipient_id = auth.uid())
          )
        )
      );
  END IF;
END $$;