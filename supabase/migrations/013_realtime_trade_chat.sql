-- 013: Enable Supabase Realtime for the trade chat screen.
--
-- Adds trade_messages and user_pins to the supabase_realtime publication so
-- the app can subscribe to postgres_changes instead of polling every 10 s.
-- RLS still applies to delivered events:
--   * trade_messages_select_participant → only trade participants receive messages
--   * user_pins_select_own + user_pins_for_trade_read → own pins plus the other
--     collector's for_trade pins (enough to refresh the potential-match banner)
--
-- Idempotent: safe to re-run if a table is already in the publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'trade_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trade_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_pins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_pins;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'trades'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trades;
  END IF;
END $$;
