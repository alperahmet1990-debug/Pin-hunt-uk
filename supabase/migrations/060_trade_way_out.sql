-- ============================================================
-- Migration 060: a chat keeps its open trade; problem reasons are one line
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/060_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. Rollback at the bottom.
-- Run AFTER 059.
--
-- Additive for the app: older builds keep working with no release-order risk,
-- apart from relinking a chat that already has an open trade.
--
--   1. link_conversation_trade() no longer replaces a link to an open trade.
--   2. trade_propose_in_chat() proposes and links in one transaction, so a
--      proposal can't exist without its chat link.
--   3. A problem reason is stored as a single line, so it can't be laid out to
--      look like a separate message.
-- ============================================================

begin;

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

revoke all on function link_conversation_trade(uuid, uuid) from public, anon;
grant execute on function link_conversation_trade(uuid, uuid) to authenticated;


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
  if not found or v_uid not in (v_conversation.participant_a_id, v_conversation.participant_b_id) then
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

revoke all on function trade_propose_in_chat(uuid, text) from public, anon;
grant execute on function trade_propose_in_chat(uuid, text) to authenticated;


create or replace function trade_report_problem(p_trade_id uuid, p_reason text)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades := trade_for_participant(p_trade_id);
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '[[:space:]]+', ' ', 'g')), '');
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

commit;

-- ============================================================
-- Verification: supabase/verify/060_verify.sql (rolls itself back).
--
-- ROLLBACK. Stored reasons stay on one line.
-- begin;
-- drop function if exists trade_propose_in_chat(uuid, text);
-- commit;
-- Then re-run link_conversation_trade from migration 032 and
-- trade_report_problem from migration 059, then:
-- notify pgrst, 'reload schema';
-- ============================================================
