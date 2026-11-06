-- ============================================================
-- Migration 061: trade follow-ups from review
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/061_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. Rollback at the bottom.
-- Run AFTER 060. Older app builds keep working.
--
--   1. Chat participant checks handle a collector who has left.
--   2. Free text collectors write about a trade is stored as plain, single
--      line text.
--   3. One waiting proposal per pair of collectors, and a limit on how many
--      one collector can have waiting.
--   4. A trade link is only ever set through the checked functions.
-- ============================================================

begin;

-- ── 1. Plain text ───────────────────────────────────────────

create or replace function trade_clean_text(p_text text)
returns text language sql immutable
set search_path = public, pg_temp as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(
      coalesce(p_text, ''),
      '[­​-‏‪-‮⁠-⁩﻿]', '', 'g'
    ),
    '[\u0001- \u007F-   -     　]+', ' ', 'g'
  )), '');
$$;

revoke all on function trade_clean_text(text) from public, anon, authenticated;


-- ── 2. Proposals ────────────────────────────────────────────

create or replace function trade_propose(p_recipient_id uuid, p_notes text default null)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_notes text := trade_clean_text(p_notes);
  v_trade trades;
begin
  if v_uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if p_recipient_id is null or p_recipient_id = v_uid then
    raise exception 'Choose another collector to trade with.' using errcode = '22023';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'Trade notes are too long.' using errcode = '22023';
  end if;
  perform trade_assert_may_commit(p_recipient_id);
  -- Serialises two proposals between the same pair, in either direction.
  perform pg_advisory_xact_lock(hashtextextended(
    least(v_uid::text, p_recipient_id::text) || greatest(v_uid::text, p_recipient_id::text), 57
  ));
  if exists (
    select 1 from trades
    where status = 'pending'
      and ((initiator_id = v_uid and recipient_id = p_recipient_id)
        or (initiator_id = p_recipient_id and recipient_id = v_uid))
  ) then
    raise exception 'There''s already a proposal waiting between you two.' using errcode = '22023';
  end if;
  if (select count(*) from trades where initiator_id = v_uid and status = 'pending') >= 20 then
    raise exception 'You have too many proposals waiting. Cancel some first.' using errcode = '22023';
  end if;
  insert into trades (initiator_id, recipient_id, notes)
    values (v_uid, p_recipient_id, v_notes)
    returning * into v_trade;
  return v_trade;
end $$;


-- ── 3. Chat participants ────────────────────────────────────

create or replace function link_conversation_trade(
  p_conversation_id uuid,
  p_trade_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  conversation_row conversations%rowtype;
  trade_row trades%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into conversation_row
  from conversations
  where id = p_conversation_id
  for update;

  if not found
     or conversation_row.participant_a_id is null
     or conversation_row.participant_b_id is null
     or caller_id not in (conversation_row.participant_a_id, conversation_row.participant_b_id) then
    raise exception 'Conversation not found';
  end if;

  select * into trade_row
  from trades
  where id = p_trade_id;

  if not found then
    raise exception 'Trade not found';
  end if;

  if not (
    (trade_row.initiator_id = conversation_row.participant_a_id
      and trade_row.recipient_id = conversation_row.participant_b_id)
    or
    (trade_row.initiator_id = conversation_row.participant_b_id
      and trade_row.recipient_id = conversation_row.participant_a_id)
  ) then
    raise exception 'Trade participants do not match this conversation';
  end if;

  if conversation_row.trade_id is not null
     and conversation_row.trade_id <> p_trade_id
     and exists (
       select 1 from trades
       where id = conversation_row.trade_id
         and status in ('pending', 'accepted', 'problem')
     ) then
    raise exception 'This chat already has a trade in progress.' using errcode = '22023';
  end if;

  update conversations
  set trade_id = p_trade_id
  where id = p_conversation_id;
end;
$$;

create or replace function trade_propose_in_chat(p_conversation_id uuid, p_notes text default null)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_conversation conversations%rowtype;
  v_trade trades;
begin
  if v_uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select * into v_conversation from conversations
    where id = p_conversation_id for update;
  if not found
     or v_conversation.participant_a_id is null
     or v_conversation.participant_b_id is null
     or v_uid not in (v_conversation.participant_a_id, v_conversation.participant_b_id) then
    raise exception 'Conversation not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from trades
    where id = v_conversation.trade_id and status in ('pending', 'accepted', 'problem')
  ) then
    raise exception 'This chat already has a trade in progress.' using errcode = '22023';
  end if;
  v_trade := trade_propose(
    case when v_conversation.participant_a_id = v_uid
         then v_conversation.participant_b_id else v_conversation.participant_a_id end,
    p_notes
  );
  update conversations set trade_id = v_trade.id where id = p_conversation_id;
  return v_trade;
end $$;


-- ── 4. Problem reasons ──────────────────────────────────────

create or replace function trade_report_problem(p_trade_id uuid, p_reason text)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades := trade_for_participant(p_trade_id);
  v_reason text := trade_clean_text(p_reason);
begin
  if v_reason is null then
    raise exception 'Tell us what went wrong.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Please keep this to 500 characters or fewer.' using errcode = '22023';
  end if;
  if v_trade.status <> 'accepted'
     or (v_trade.initiator_posted_at is null and v_trade.recipient_posted_at is null) then
    raise exception 'A problem can be reported once pins have been posted.' using errcode = '22023';
  end if;
  update trades set
    status = 'problem', problem_reported_by = auth.uid(), problem_reported_at = now(),
    problem_reason = v_reason, updated_at = now()
  where id = p_trade_id returning * into v_trade;
  return v_trade;
end $$;


-- ── 5. New chats start with no trade ────────────────────────

drop policy if exists "conversations_insert_no_trade_link" on conversations;
create policy "conversations_insert_no_trade_link" on conversations
  as restrictive for insert to authenticated
  with check (trade_id is null);

commit;

-- ============================================================
-- Verification: supabase/verify/061_verify.sql (rolls itself back).
--
-- ROLLBACK. Stored text stays cleaned.
-- begin;
-- drop policy if exists "conversations_insert_no_trade_link" on conversations;
-- commit;
-- Then re-run from migration 060: link_conversation_trade,
-- trade_propose_in_chat and trade_report_problem; from migration 057:
-- trade_propose; and only then:
-- drop function if exists trade_clean_text(text);
-- notify pgrst, 'reload schema';
-- ============================================================
