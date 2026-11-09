-- ============================================================
-- Migration 071: every trade step shows in the chat; trades waiting for you
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/071_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. See supabase/verify/071_RUNBOOK.md.
-- Run AFTER 070.
--
-- Additive for the app: older builds keep working. They show the new chat
-- lines as ordinary text messages from the collector who took the step.
--
--   1. conversation_messages.trade_id / trade_event mark a line the server
--      wrote about a trade step. Clients can't write either column.
--   2. Each trade step writes exactly one such line into the trade's chat,
--      sent as the collector who took the step, so the other collector's
--      unread count (get_conversation_unread_counts, 026) goes up unchanged:
--        proposed       pending trade linked to a chat
--        items_changed  the pins changed while waiting (070)
--        accepted, declined, cancelled, problem
--        posted         first "posted" mark only (not tracking updates)
--        received       first "received" mark, unless it completes the trade
--        completed      the second "received" mark
--      The lines are written by triggers on trades and conversations, so
--      every path that changes a trade is covered without replacing the
--      trade functions.
--   3. Nothing is written when:
--        - the trade has no chat, or the chat has lost a participant
--        - either collector has blocked the other
--        - either collector is suspended
--        - the step wasn't taken by one of the two collectors (an admin
--          closing a problem report)
--      Contact preferences (066) only govern starting a new chat. These
--      lines only go into the chat the two collectors already share.
--   4. trades_waiting_for_me() counts the caller's trades where the next
--      step is theirs: answering a proposal, posting their pins, or
--      confirming they received the other collector's pins.
-- ============================================================

begin;

-- ── 1. Shape ────────────────────────────────────────────────

alter table conversation_messages
  add column if not exists trade_id    uuid references trades(id) on delete set null,
  add column if not exists trade_event text;

alter table conversation_messages drop constraint if exists conversation_messages_trade_event_check;
alter table conversation_messages add constraint conversation_messages_trade_event_check
  check (trade_event is null or trade_event in (
    'proposed', 'items_changed', 'accepted', 'declined', 'cancelled',
    'posted', 'received', 'completed', 'problem'
  ));

create index if not exists conversation_messages_trade_idx
  on conversation_messages (trade_id) where trade_id is not null;

-- Only the server writes trade lines.
drop policy if exists "conv_messages_insert_no_trade_event" on conversation_messages;
create policy "conv_messages_insert_no_trade_event" on conversation_messages
  as restrictive for insert to authenticated
  with check (trade_id is null and trade_event is null);


-- ── 2. Writing a trade line ─────────────────────────────────

-- Internal. p_actor took the step; the line is written as them.
create or replace function trade_post_event(p_trade trades, p_event text, p_actor uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_conversation conversations%rowtype;
  v_name text;
  v_body text;
begin
  if p_actor is null or p_actor not in (p_trade.initiator_id, p_trade.recipient_id) then
    return;
  end if;
  select * into v_conversation from conversations
   where trade_id = p_trade.id
   order by created_at desc
   limit 1;
  if not found
     or v_conversation.participant_a_id is null
     or v_conversation.participant_b_id is null then
    return;
  end if;
  if exists (
       select 1 from user_blocks
        where (blocker_id = p_trade.initiator_id and blocked_id = p_trade.recipient_id)
           or (blocker_id = p_trade.recipient_id and blocked_id = p_trade.initiator_id))
     or exists (
       select 1 from user_suspensions
        where user_id in (p_trade.initiator_id, p_trade.recipient_id)) then
    return;
  end if;

  select '@' || username into v_name from profiles where id = p_actor and username is not null;
  v_name := coalesce(v_name, 'A collector');
  v_body := v_name || case p_event
    when 'proposed'      then ' proposed a trade.'
    when 'items_changed' then ' changed the pins in the trade.'
    when 'accepted'      then ' accepted the trade.'
    when 'declined'      then ' declined the trade.'
    when 'cancelled'     then ' cancelled the trade.'
    when 'posted'        then ' posted their pins.'
    when 'received'      then ' received their pins.'
    when 'completed'     then ' received their pins. Trade complete.'
    when 'problem'       then ' reported a problem with the trade.'
  end;

  insert into conversation_messages (conversation_id, sender_id, body, message_type, trade_id, trade_event)
  values (v_conversation.id, p_actor, v_body, 'text', p_trade.id, p_event);
end $$;

revoke all on function trade_post_event(trades, text, uuid) from public, anon, authenticated;

-- One line per trade update, for the step it records.
create or replace function trades_post_chat_event()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_event text;
begin
  if new.status is distinct from old.status then
    v_event := case new.status
      when 'accepted'  then 'accepted'
      when 'rejected'  then 'declined'
      when 'cancelled' then 'cancelled'
      when 'problem'   then 'problem'
      when 'completed' then 'completed'
    end;
  elsif new.status = 'accepted'
        and ((old.initiator_received_at is null and new.initiator_received_at is not null)
          or (old.recipient_received_at is null and new.recipient_received_at is not null)) then
    -- The second mark completes the trade in the same call, which writes
    -- 'completed' instead.
    if new.initiator_received_at is null or new.recipient_received_at is null then
      v_event := 'received';
    end if;
  elsif new.status = 'accepted'
        and ((old.initiator_posted_at is null and new.initiator_posted_at is not null)
          or (old.recipient_posted_at is null and new.recipient_posted_at is not null)) then
    v_event := 'posted';
  elsif new.status = 'pending' and new.items_version > old.items_version and old.items_version > 0 then
    -- items_version 0 -> 1 is the proposal itself, which writes 'proposed'.
    v_event := 'items_changed';
  end if;

  if v_event is not null then
    perform trade_post_event(new, v_event, auth.uid());
  end if;
  return new;
end $$;

revoke all on function trades_post_chat_event() from public, anon, authenticated;

drop trigger if exists trades_post_chat_event on trades;
create trigger trades_post_chat_event
  after update on trades
  for each row execute function trades_post_chat_event();

-- A proposal is linked to its chat after the trade row is written, so
-- 'proposed' is written when the link is made.
create or replace function conversations_post_trade_proposed()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades;
begin
  if new.trade_id is not null and new.trade_id is distinct from old.trade_id then
    select * into v_trade from trades where id = new.trade_id;
    if found and v_trade.status = 'pending' then
      perform trade_post_event(v_trade, 'proposed', auth.uid());
    end if;
  end if;
  return new;
end $$;

revoke all on function conversations_post_trade_proposed() from public, anon, authenticated;

drop trigger if exists conversations_post_trade_proposed on conversations;
create trigger conversations_post_trade_proposed
  after update of trade_id on conversations
  for each row execute function conversations_post_trade_proposed();


-- ── 3. Trades waiting for the caller ────────────────────────

create or replace function trades_waiting_for_me()
returns integer language sql stable security definer
set search_path = public, pg_temp as $$
  select count(*)::integer from trades t
   where auth.uid() is not null
     and (
       (t.status = 'pending' and t.recipient_id = auth.uid())
       or (t.status = 'accepted' and t.initiator_id = auth.uid() and (
             t.initiator_posted_at is null
             or (t.recipient_posted_at is not null and t.initiator_received_at is null)))
       or (t.status = 'accepted' and t.recipient_id = auth.uid() and (
             t.recipient_posted_at is null
             or (t.initiator_posted_at is not null and t.recipient_received_at is null)))
     );
$$;

revoke all on function trades_waiting_for_me() from public, anon;
grant execute on function trades_waiting_for_me() to authenticated;

commit;

-- ============================================================
-- Verification: supabase/verify/071_verify.sql (rolls itself back).
--
-- ROLLBACK (run as one block). Trade lines already written stay in the
-- chats as ordinary text messages.
-- begin;
-- drop function if exists trades_waiting_for_me();
-- drop trigger if exists conversations_post_trade_proposed on conversations;
-- drop function if exists conversations_post_trade_proposed();
-- drop trigger if exists trades_post_chat_event on trades;
-- drop function if exists trades_post_chat_event();
-- drop function if exists trade_post_event(trades, text, uuid);
-- drop policy if exists "conv_messages_insert_no_trade_event" on conversation_messages;
-- drop index if exists conversation_messages_trade_idx;
-- alter table conversation_messages drop constraint if exists conversation_messages_trade_event_check;
-- alter table conversation_messages drop column if exists trade_event, drop column if exists trade_id;
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
