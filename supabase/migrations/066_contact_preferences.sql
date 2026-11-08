-- ============================================================
-- Migration 066: contact preferences (#505)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/066_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate approval. See supabase/verify/066_RUNBOOK.md.
-- Run AFTER 061 (it replaces trade_propose from 061). If another migration
-- takes 066 first, renumber this file and its verify script.
--
-- The "Allow Messages" and "Allow Trade Requests" settings in Edit Profile
-- (profiles.allow_messages, profiles.allow_trade_requests) now decide whether
-- someone can START contact:
--
--   1. collector_contact_preferences(uuid): what another collector accepts,
--      for the app to show or hide Message and Propose Trade. Returns only
--      two booleans, never other profile data, and works for private
--      profiles too.
--   2. A BEFORE INSERT trigger on conversations: a new chat needs the other
--      collector to allow messages.
--   3. trade_propose (and so trade_propose_in_chat): a new proposal needs the
--      other collector to allow trade requests.
--
-- Existing chats, messages and trades are unchanged. Turning messages off
-- stops new chats; to end an existing one, block the collector. Admins have
-- no exception. Service-role and SQL-editor inserts (no signed-in user) are
-- not checked.
-- ============================================================

begin;

-- ── 1. What another collector accepts ──────────────────────

create or replace function public.collector_contact_preferences(p_user uuid)
returns table (accepts_messages boolean, accepts_trade_requests boolean)
language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(p.allow_messages, false), coalesce(p.allow_trade_requests, false)
  from (select 1) x
  left join profiles p on p.id = p_user;
$$;

revoke all on function public.collector_contact_preferences(uuid) from public, anon;
grant execute on function public.collector_contact_preferences(uuid) to authenticated;


-- ── 2. New chats ───────────────────────────────────────────

create or replace function public.conversations_check_contact_preference()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
begin
  if v_uid is null then
    return new;
  end if;
  v_other := case when new.participant_a_id = v_uid then new.participant_b_id
                  else new.participant_a_id end;
  if v_other is not null
     and not coalesce((select allow_messages from profiles where id = v_other), false) then
    raise exception 'This collector isn''t taking new messages.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.conversations_check_contact_preference() from public, anon, authenticated;

drop trigger if exists conversations_check_contact_preference on conversations;
create trigger conversations_check_contact_preference
  before insert on conversations
  for each row execute function public.conversations_check_contact_preference();


-- ── 3. New trade proposals ─────────────────────────────────
-- Same as 061, plus the allow_trade_requests check after the block and
-- suspension checks.

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
  if not coalesce((select allow_trade_requests from profiles where id = p_recipient_id), false) then
    raise exception 'This collector isn''t taking trade requests right now.' using errcode = '42501';
  end if;
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

revoke all on function trade_propose(uuid, text) from public, anon;
grant execute on function trade_propose(uuid, text) to authenticated;

commit;

-- ============================================================
-- Verification: supabase/verify/066_verify.sql (rolls itself back).
--
-- ROLLBACK:
-- begin;
-- drop trigger if exists conversations_check_contact_preference on conversations;
-- drop function if exists public.conversations_check_contact_preference();
-- drop function if exists public.collector_contact_preferences(uuid);
-- -- Then re-run section 2 of 061_trade_followups.sql to restore trade_propose.
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
